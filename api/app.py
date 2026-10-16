"""
Flask API + dashboard server for the Insurance Policy Analytics System.

Run (from the project root):
    pip install -r requirements.txt
    python api/app.py
Then open http://127.0.0.1:5000

Endpoints
    GET  /                 the dashboard (dashboard/index.html)
    GET  /health           API status, loaded model, threshold
    GET  /fields           input fields the model understands
    POST /predict          fraud probability for one claim or a list of claims
    GET  /api/stats        chart data for the dashboard
    GET  /api/options      category values for the form drop-downs
    GET  /api/sample-claim a random real claim (to fill the form)
    GET  /api/top-claims   the highest-scoring claims in the data
    POST /predict-status   predicted claim status (Approved/Rejected/Under Review)
    GET  /api/provider-risk  per-provider fraud rate trend (Rising/Stable/Falling)
    GET  /api/loss-ratio   premium vs. paid-claims loss ratio, overall and by segment
    GET  /api/documents    list this browser session's policy documents
    POST /api/documents    upload and index a PDF, TXT, or DOCX
    GET  /api/documents/<id>/status  document processing status
    DELETE /api/documents/<id>  delete a document and its passages
    POST /api/chat        retrieve and cite evidence from selected documents
"""
import json
import os
import runpy
import secrets
import sys
import uuid
from io import StringIO
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from flask import Flask, jsonify, request, send_from_directory, session
from sklearn.model_selection import train_test_split
from werkzeug.exceptions import RequestEntityTooLarge

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

try:
    from api.anomaly_detection import detect_claim_anomalies
    from api.claim_extraction import ClaimDocumentStore, ClaimExtractionError
    from api.duplicate_detection import find_duplicate_claims
    from api.explainability import explain_claim
    from api.policy_verification import verify_claim_against_policy
    from api.rag import DEFAULT_MIN_SCORE, DEFAULT_TOP_K, MAX_FILE_BYTES, DocumentError, RagStore
except ImportError:                  # running directly as `python api/app.py`
    from anomaly_detection import detect_claim_anomalies
    from claim_extraction import ClaimDocumentStore, ClaimExtractionError
    from duplicate_detection import find_duplicate_claims
    from explainability import explain_claim
    from policy_verification import verify_claim_against_policy
    from rag import DEFAULT_MIN_SCORE, DEFAULT_TOP_K, MAX_FILE_BYTES, DocumentError, RagStore

try:                                   # optional: lets a separate React app call this API
    from flask_cors import CORS
except ImportError:                    # pragma: no cover
    CORS = None

# ---------------------------------------------------------------- settings
PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAG_DATA_DIR = Path(os.environ.get("RAG_DATA_DIR", PROJECT_ROOT / "data" / "rag"))
CLAIM_DATA_DIR = Path(os.environ.get("CLAIM_DATA_DIR", PROJECT_ROOT / "data" / "claim_analysis"))
MODEL_PATH = Path(os.environ.get("MODEL_PATH", PROJECT_ROOT / "ml" / "health_claims_model.joblib"))
DASHBOARD_DIR = next((d for d in (PROJECT_ROOT / "frontend-new" / "dist", PROJECT_ROOT / "frontend", PROJECT_ROOT / "dashboard")
                      if (d / "index.html").exists()), PROJECT_ROOT / "frontend-new" / "dist")
DATA_CANDIDATES = [
    os.environ.get("DATA_PATH"),
    PROJECT_ROOT / "data" / "processed" / "health_claims_clean.csv",
    PROJECT_ROOT / "data" / "processed" / "claims_clean.csv",
]
STATUS_MODEL_PATH = Path(os.environ.get("STATUS_MODEL_PATH", PROJECT_ROOT / "ml" / "claim_status_model.joblib"))
DEFAULT_THRESHOLD = 0.30               # used if the saved model file has no threshold
DATE_COLUMNS = ["Claim_Date", "Service_Date", "Policy_Expiration_Date", "Policy_Start_Date"]
MAX_BATCH = 1000
MIN_GROUP = 100                        # hide chart groups with fewer claims than this
# These two must match the train_test_split() call in your model.py. They let the
# dashboard find the claims the model never saw during training.
TEST_SIZE = 0.2
RANDOM_STATE = 42

# ------------------------------------------------------------- load model

def train_default_model():
    """Create the local training artifacts lazily when the repo is freshly checked out."""
    if MODEL_PATH.exists():
        return True
    data_path = PROJECT_ROOT / "data" / "processed" / "health_claims_clean.csv"
    if not data_path.exists():
        return False
    previous = Path.cwd()
    try:
        os.chdir(PROJECT_ROOT)
        for script in (PROJECT_ROOT / "ml" / "model.py", PROJECT_ROOT / "ml" / "claim_status_model.py"):
            if script.exists() and not script.name.startswith("claim_status") and MODEL_PATH.exists():
                continue
            if script.exists() and script.name.startswith("claim_status") and STATUS_MODEL_PATH.exists():
                continue
            if script.exists():
                runpy.run_path(str(script), run_name="__main__")
    finally:
        os.chdir(previous)
    return MODEL_PATH.exists()


model = None
THRESHOLD = float(os.environ.get("FRAUD_THRESHOLD", DEFAULT_THRESHOLD))
EXPECTED_COLUMNS = []
CATEGORICAL = []
NUMERIC = []
RAW_FIELDS = []

if MODEL_PATH.exists() or train_default_model():
    saved = joblib.load(MODEL_PATH)
    if isinstance(saved, dict):            # {"model": pipeline, "threshold": 0.3}
        model = saved["model"]
        THRESHOLD = float(os.environ.get("FRAUD_THRESHOLD", saved.get("threshold", DEFAULT_THRESHOLD)))
    else:                                  # a bare pipeline saved earlier
        model = saved
        THRESHOLD = float(os.environ.get("FRAUD_THRESHOLD", DEFAULT_THRESHOLD))

    preprocessor = model.named_steps["preprocessor"]
    EXPECTED_COLUMNS = list(preprocessor.feature_names_in_)
    CATEGORICAL = [cols for name, _, cols in preprocessor.transformers_ if name == "categorical"]
    CATEGORICAL = list(CATEGORICAL[0]) if CATEGORICAL else []
    NUMERIC = [c for c in EXPECTED_COLUMNS if c not in CATEGORICAL]

    # The raw fields a caller sends (dates are sent whole, the API splits them)
    for col in EXPECTED_COLUMNS:
        base = next((d for d in DATE_COLUMNS if col.startswith(d + "_")), None)
        name = base if base else col
        if name not in RAW_FIELDS:
            RAW_FIELDS.append(name)

# ------------------------------------------------- load claim-status model (optional)
# This is a SEPARATE model from the fraud classifier above (see ml/claim_status_model.py).
# If it hasn't been trained yet, the API still runs fine -- /predict-status just
# responds with a 503 until the file exists.
status_model = None
status_label_encoder = None
STATUS_EXPECTED_COLUMNS = []
STATUS_CATEGORICAL = []
STATUS_NUMERIC = []
STATUS_RAW_FIELDS = []

if STATUS_MODEL_PATH.exists():
    status_saved = joblib.load(STATUS_MODEL_PATH)
    status_model = status_saved["model"]
    status_label_encoder = status_saved["label_encoder"]

    status_preprocessor = status_model.named_steps["preprocessor"]
    STATUS_EXPECTED_COLUMNS = list(status_preprocessor.feature_names_in_)
    _status_cat = [cols for name, _, cols in status_preprocessor.transformers_ if name == "categorical"]
    STATUS_CATEGORICAL = list(_status_cat[0]) if _status_cat else []
    STATUS_NUMERIC = [c for c in STATUS_EXPECTED_COLUMNS if c not in STATUS_CATEGORICAL]

    for col in STATUS_EXPECTED_COLUMNS:
        base = next((d for d in DATE_COLUMNS if col.startswith(d + "_")), None)
        name = base if base else col
        if name not in STATUS_RAW_FIELDS:
            STATUS_RAW_FIELDS.append(name)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_FILE_BYTES + 1024 * 1024
app.config["SECRET_KEY"] = os.environ.get("RAG_SESSION_SECRET")
if not app.config["SECRET_KEY"]:
    RAG_DATA_DIR.mkdir(parents=True, exist_ok=True)
    secret_path = RAG_DATA_DIR / ".session_secret"
    try:
        app.config["SECRET_KEY"] = secret_path.read_text(encoding="ascii")
    except FileNotFoundError:
        generated_secret = secrets.token_hex(32)
        try:
            with secret_path.open("x", encoding="ascii") as secret_file:
                secret_file.write(generated_secret)
            app.config["SECRET_KEY"] = generated_secret
        except FileExistsError:
            app.config["SECRET_KEY"] = secret_path.read_text(encoding="ascii")
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = os.environ.get("SESSION_COOKIE_SECURE", "").lower() in {
    "1", "true", "yes",
}
RAG_STORE = RagStore(RAG_DATA_DIR)
CLAIM_STORE = ClaimDocumentStore(CLAIM_DATA_DIR)
if CORS:
    import re
    CORS(
        app,
        supports_credentials=True,
        origins=[
            re.compile(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"),
        ],
    )


def rag_owner_id():
    """Give each browser session a separate, signed document-library scope."""
    if "rag_owner_id" not in session:
        session["rag_owner_id"] = uuid.uuid4().hex
    return session["rag_owner_id"]


@app.errorhandler(RequestEntityTooLarge)
def request_too_large(_error):
    return jsonify(error="Request is too large. Documents must be 20 MB or smaller."), 413


# ---------------------------------------------------------------- scoring
def prepare(records, expected_columns=None, numeric=None, categorical=None):
    """Turn raw claim dicts (or a DataFrame) into the exact columns a model was trained on.

    Defaults to the fraud model's columns; pass expected_columns/numeric/categorical
    to reuse this for a different model (e.g. the claim-status model).
    """
    expected_columns = expected_columns if expected_columns is not None else EXPECTED_COLUMNS
    numeric = numeric if numeric is not None else NUMERIC
    categorical = categorical if categorical is not None else CATEGORICAL

    df = pd.DataFrame(records)

    # same date handling as training: date -> year / month / day
    for col in DATE_COLUMNS:
        if col in df.columns:
            dates = pd.to_datetime(df[col], errors="coerce")
            df[col + "_Year"] = dates.dt.year
            df[col + "_Month"] = dates.dt.month
            df[col + "_Day"] = dates.dt.day

    df = df.reindex(columns=expected_columns)          # missing fields become NaN

    for col in numeric:
        df[col] = pd.to_numeric(df[col], errors="coerce").astype(float)
    for col in categorical:
        df[col] = df[col].astype(object).where(df[col].isna(), df[col].astype(str))
    return df


def risk_level(prob):
    if prob >= THRESHOLD:
        return "High"
    if prob >= THRESHOLD / 2:
        return "Medium"
    return "Low"


def _serialise_claim_row(row):
    """Return a JSON-friendly row for a single claim record."""
    payload = {}
    for key, value in row.items():
        if pd.isna(value):
            payload[key] = None
        elif isinstance(value, pd.Timestamp):
            payload[key] = value.strftime("%Y-%m-%d")
        else:
            payload[key] = value.item() if hasattr(value, "item") else value
    for key in ("Claim_Date", "Service_Date", "Policy_Expiration_Date", "Policy_Start_Date"):
        if payload.get(key) is not None and isinstance(payload[key], str):
            try:
                payload[key] = str(pd.to_datetime(payload[key]).date())
            except Exception:
                pass
    return payload


# ------------------------------------------------------- dashboard data
def load_data():
    for path in DATA_CANDIDATES:
        if path and Path(path).exists():
            df = pd.read_csv(path)
            df["Is_Fraudulent"] = df["Is_Fraudulent"].astype(int)
            df["Claim_Date"] = pd.to_datetime(df["Claim_Date"], errors="coerce")
            return df
    return None


DATA = load_data()
_cache = {}


def need_data():
    if DATA is None:
        return jsonify(error="Cleaned data file not found. Put it in data/processed/ "
                             "or set the DATA_PATH environment variable."), 503
    return None


def scored_data():
    """The dataset with a model fraud probability for every claim (computed once)."""
    if model is None:
        raise RuntimeError("Fraud model is not available. The project is still training it.")
    if "scored" not in _cache:
        df = DATA.copy()
        df["fraud_prob"] = model.predict_proba(prepare(df))[:, 1]
        # same split as training -> the rows in the test part were never seen by the model
        _, test_index = train_test_split(df.index, test_size=TEST_SIZE,
                                         random_state=RANDOM_STATE, stratify=df["Is_Fraudulent"])
        df["is_test"] = df.index.isin(test_index)
        _cache["scored"] = df
    return _cache["scored"]


def rate_rows(df, key, min_n=MIN_GROUP):
    """Fraud rate per group -> list of {label, rate, n}."""
    g = df.groupby(key, observed=True)["Is_Fraudulent"].agg(["mean", "size"])
    g = g[g["size"] >= min_n]
    return [{"label": str(k), "rate": round(float(r["mean"]), 4), "n": int(r["size"])}
            for k, r in g.iterrows()]


def binned(df, column, edges, labels):
    tmp = df.assign(_bin=pd.cut(df[column], bins=edges, labels=labels, right=False))
    rows = rate_rows(tmp, "_bin", min_n=1)
    order = {l: i for i, l in enumerate(labels)}
    return sorted(rows, key=lambda r: order[r["label"]])


PROVIDER_MIN_CLAIMS = 15         # ignore providers with too few claims to judge reliably
PROVIDER_MIN_PERIOD_CLAIMS = 4   # ignore a period with too few claims for that provider
RISING_THRESHOLD = 0.10          # flag "Rising" if latest period's rate is this much higher
                                 # than the provider's own earlier average


def build_provider_risk():
    """Per-provider (Hospital_ID) fraud-rate trend, not just a single overall rate.

    Looks at each provider's fraud rate year by year and flags ones where the rate
    is climbing -- a different signal than flagging one claim at a time: this catches
    a provider whose behaviour is getting worse over time, even if no single claim
    looks dramatic on its own.

    Uses YEARLY buckets rather than quarterly: this dataset averages only ~20 claims
    per provider across several years, too thin to form a reliable quarterly rate.
    """
    df = DATA.copy()
    df["_period"] = df["Claim_Date"].dt.year.astype("Int64").astype(str)

    overall = df.groupby("Hospital_ID").agg(
        provider_type=("Provider_Type", "first"),
        specialty=("Provider_Specialty", "first"),
        total_claims=("Is_Fraudulent", "size"),
        overall_fraud_rate=("Is_Fraudulent", "mean"),
        total_claim_amount=("Claim_Amount", "sum"),
    )
    overall = overall[overall["total_claims"] >= PROVIDER_MIN_CLAIMS]

    periods = (
        df.groupby(["Hospital_ID", "_period"])["Is_Fraudulent"]
        .agg(["mean", "size"])
        .reset_index()
    )
    periods = periods[periods["size"] >= PROVIDER_MIN_PERIOD_CLAIMS]

    rows = []
    for hospital_id, prov in overall.iterrows():
        prows = periods[periods["Hospital_ID"] == hospital_id].sort_values("_period")
        if len(prows) < 2:
            trend = "Not enough history"
            latest_rate = float(prov["overall_fraud_rate"])
            delta = 0.0
        else:
            latest_rate = float(prows.iloc[-1]["mean"])
            earlier_avg = float(prows.iloc[:-1]["mean"].mean())
            delta = round(latest_rate - earlier_avg, 4)
            if delta >= RISING_THRESHOLD:
                trend = "Rising"
            elif delta <= -RISING_THRESHOLD:
                trend = "Falling"
            else:
                trend = "Stable"

        rows.append({
            "hospital_id": int(hospital_id),
            "provider_type": prov["provider_type"],
            "specialty": prov["specialty"],
            "total_claims": int(prov["total_claims"]),
            "overall_fraud_rate": round(float(prov["overall_fraud_rate"]), 4),
            "latest_period_fraud_rate": round(latest_rate, 4),
            "trend": trend,
            "trend_delta": delta,
            "total_claim_amount": round(float(prov["total_claim_amount"]), 2),
            "periods_observed": len(prows),
        })

    rows.sort(key=lambda r: (-1 if r["trend"] == "Rising" else 0, -r["overall_fraud_rate"]))
    return rows


LOSS_RATIO_MIN_GROUP = 50   # hide segments with too few policies for a reliable ratio


def _loss_ratio_rows(df, key):
    """Premiums collected vs. claims actually paid out (Approved claims only) per group."""
    g = df.groupby(key, observed=True).apply(
        lambda d: pd.Series({
            "premium_collected": d["Premium_Amount"].sum(),
            "claims_paid": d.loc[d["Claim_Status"] == "Approved", "Claim_Amount"].sum(),
            "n": len(d),
        }),
        include_groups=False,
    )
    g = g[g["n"] >= LOSS_RATIO_MIN_GROUP]
    g["loss_ratio"] = g["claims_paid"] / g["premium_collected"]
    return [
        {
            "label": str(idx),
            "loss_ratio": round(float(r["loss_ratio"]), 4),
            "premium_collected": round(float(r["premium_collected"]), 2),
            "claims_paid": round(float(r["claims_paid"]), 2),
            "n": int(r["n"]),
        }
        for idx, r in g.iterrows()
    ]


def build_loss_ratio():
    """Premium vs. paid-out-claims analysis -- the core insurance profitability metric.

    loss_ratio = claims actually paid out (Approved claims only) / premium collected.
    Industry benchmark is roughly 0.6-0.8; this reuses Claim_Status so only money
    the insurer actually pays counts as a "loss", not claims that were rejected.
    """
    df = DATA.copy()

    overall_premium = float(df["Premium_Amount"].sum())
    overall_paid = float(df.loc[df["Claim_Status"] == "Approved", "Claim_Amount"].sum())

    return {
        "overall": {
            "loss_ratio": round(overall_paid / overall_premium, 4),
            "premium_collected": round(overall_premium, 2),
            "claims_paid": round(overall_paid, 2),
            "policies": int(len(df)),
        },
        "by_policy_type": sorted(_loss_ratio_rows(df, "Policy_Type"),
                                  key=lambda r: -r["loss_ratio"]),
        "by_income_bracket": sorted(_loss_ratio_rows(df, "Patient_Income_Bracket"),
                                     key=lambda r: -r["loss_ratio"]),
        "by_provider_type": sorted(_loss_ratio_rows(df, "Provider_Type"),
                                    key=lambda r: -r["loss_ratio"]),
        "by_network": sorted(_loss_ratio_rows(df, "Network_Provider"),
                              key=lambda r: -r["loss_ratio"]),
    }


def build_stats():
    df = DATA
    fraud = df["Is_Fraudulent"] == 1
    scored = scored_data()

    by_provider = sorted(rate_rows(df, "Provider_Type"), key=lambda r: -r["rate"])
    by_specialty = sorted(rate_rows(df, "Provider_Specialty"), key=lambda r: -r["rate"])
    by_service = sorted(rate_rows(df, "Service_Type"), key=lambda r: -r["rate"])
    by_admission = sorted(rate_rows(df, "Admission_Type"), key=lambda r: -r["rate"])

    quarter = df.assign(_q=df["Claim_Date"].dt.to_period("Q").astype(str))
    by_quarter = sorted(rate_rows(quarter, "_q", min_n=300), key=lambda r: r["label"])  # skips part-filled quarters

    held = scored[scored["is_test"]]
    flagged = held["fraud_prob"] >= THRESHOLD
    actual = held["Is_Fraudulent"] == 1
    caught = int((flagged & actual).sum())
    test = {
        "n": int(len(held)),
        "flagged": int(flagged.sum()),
        "precision": round(caught / max(int(flagged.sum()), 1), 4),
        "recall": round(caught / max(int(actual.sum()), 1), 4),
    }

    by_age = binned(df, "Patient_Age", [0, 18, 35, 50, 65, 200],
                    ["0-17", "18-34", "35-49", "50-64", "65+"])
    by_distance = binned(df, "Provider_Patient_Distance_Miles", [0, 200, 400, 600, 800, 10_000],
                         ["0-199", "200-399", "400-599", "600-799", "800+"])
    by_amount = binned(df, "Claim_Amount", [0, 500_000, 1_000_000, 1_500_000, 2_000_000, 10**9],
                       ["<0.5M", "0.5-1M", "1-1.5M", "1.5-2M", "2M+"])
    by_procedures = rate_rows(df.assign(_p=df["Number_of_Procedures"].astype(int)), "_p", min_n=1)
    by_procedures = sorted(by_procedures, key=lambda r: int(r["label"]))

    return {
        "threshold": THRESHOLD,
        "test": test,
        "kpis": {
            "claims": int(len(df)),
            "fraud_claims": int(fraud.sum()),
            "fraud_rate": round(float(fraud.mean()), 4),
            "avg_claim_amount": round(float(df["Claim_Amount"].mean()), 2),
            "fraud_money_share": round(float(df.loc[fraud, "Claim_Amount"].sum()
                                             / df["Claim_Amount"].sum()), 4),
            "flagged_by_model": int((scored["fraud_prob"] >= THRESHOLD).sum()),
        },
        "by_provider_type": by_provider,
        "by_specialty": by_specialty,
        "by_service_type": by_service,
        "by_admission_type": by_admission,
        "by_quarter": by_quarter,
        "by_age": by_age,
        "by_distance": by_distance,
        "by_amount": by_amount,
        "by_procedures": by_procedures,
        "date_range": [str(df["Claim_Date"].min().date()), str(df["Claim_Date"].max().date())],
    }


# -------------------------------------------------------------- endpoints
@app.get("/")
def dashboard():
    if not (DASHBOARD_DIR / "index.html").exists():
        return jsonify(message="Insurance Analytics API",
                       endpoints=["/health", "/fields", "/predict", "/api/stats"]), 200
    return send_from_directory(DASHBOARD_DIR, "index.html")


@app.get("/assets/<path:filename>")
def serve_assets(filename):
    assets_dir = DASHBOARD_DIR / "assets"
    if assets_dir.exists():
        return send_from_directory(assets_dir, filename)
    return jsonify(error="Asset not found"), 404


@app.get("/health")
def health():
    return jsonify(status="ok", model=MODEL_PATH.name, threshold=THRESHOLD,
                   n_input_features=len(EXPECTED_COLUMNS), data_loaded=DATA is not None,
                   status_model_loaded=status_model is not None)


@app.get("/api/documents")
def list_documents():
    return jsonify(documents=RAG_STORE.list_documents(rag_owner_id()))


@app.post("/api/documents")
def upload_document():
    upload = request.files.get("file")
    if upload is None:
        return jsonify(error="Choose a PDF, TXT, or DOCX document to upload."), 400
    content = upload.stream.read(MAX_FILE_BYTES + 1)
    try:
        document = RAG_STORE.add_document(rag_owner_id(), upload.filename, content)
    except DocumentError as exc:
        body = {"error": str(exc)}
        if hasattr(exc, "document_id"):
            body["document_id"] = exc.document_id
        return jsonify(body), 422
    return jsonify(document=document), 201


@app.get("/api/documents/<document_id>/status")
def document_status(document_id):
    document = RAG_STORE.document_status(rag_owner_id(), document_id)
    if document is None:
        return jsonify(error="Document not found."), 404
    return jsonify(document=document)


@app.delete("/api/documents/<document_id>")
def delete_document(document_id):
    if not RAG_STORE.delete_document(rag_owner_id(), document_id):
        return jsonify(error="Document not found."), 404
    return jsonify(deleted=True, document_id=document_id)


@app.get("/api/person-search")
def api_person_search():
    missing = need_data()
    if missing:
        return missing
    identifier = (request.args.get("identifier") or request.args.get("patient_id") or request.args.get("policy_number") or "").strip()
    if not identifier:
        return jsonify(error="Provide a Patient_ID or Policy_Number to search for."), 400
    df = DATA.copy()
    q = str(identifier)
    mask = (df["Patient_ID"].astype(str) == q) | (df["Policy_Number"].astype(str) == q)
    matches = df.loc[mask].copy()
    if matches.empty:
        return jsonify(results=[], count=0, identifier=q, message="No verified patient record matched that identifier."), 200

    results = []
    for patient_id, group in matches.groupby("Patient_ID", dropna=False):
        group = group.sort_values("Claim_Date")
        total_claims = float(group["Claim_Amount"].sum())
        results.append({
            "patient_id": int(patient_id),
            "policy_numbers": [str(v) for v in group["Policy_Number"].dropna().astype(str).unique().tolist()],
            "claim_count": int(len(group)),
            "total_claim_amount": round(total_claims, 2),
            "latest_claim_date": str(group["Claim_Date"].max().date()) if not group["Claim_Date"].dropna().empty else None,
            "status_breakdown": {k: int(v) for k, v in group["Claim_Status"].fillna("Unknown").value_counts().to_dict().items()},
        })
    return jsonify(results=results, count=len(results), identifier=q)


@app.get("/api/person-claims")
def api_person_claims():
    missing = need_data()
    if missing:
        return missing
    patient_id = request.args.get("patient_id", "").strip()
    if not patient_id:
        return jsonify(error="patient_id is required."), 400
    mask = DATA["Patient_ID"].astype(str) == patient_id
    matches = DATA.loc[mask].copy().sort_values("Claim_Date")
    if matches.empty:
        return jsonify(claims=[], count=0, patient_id=patient_id, message="No claims are linked to that patient identifier."), 200
    claims = [_serialise_claim_row(row) for _, row in matches.iterrows()]
    return jsonify(claims=claims, count=len(claims), patient_id=patient_id, total_claim_amount=round(float(matches["Claim_Amount"].sum()), 2))


@app.get("/api/claim-search")
def api_claim_search():
    missing = need_data()
    if missing:
        return missing
    claim_id = request.args.get("claim_id", "").strip()
    if not claim_id:
        return jsonify(error="claim_id is required."), 400
    matches = DATA.loc[DATA["Claim_ID"].astype(str) == claim_id].copy()
    if matches.empty:
        return jsonify(claim=None, count=0, claim_id=claim_id, message="No claim matched that identifier."), 200
    claim = _serialise_claim_row(matches.iloc[0])
    return jsonify(claim=claim, count=1, claim_id=claim_id)


@app.get("/api/review-claims")
def api_review_claims():
    missing = need_data()
    if missing:
        return missing
    limit = min(max(request.args.get("limit", 200, type=int), 1), 500)
    columns = [
        "Claim_ID", "Policy_Number", "Claim_Amount", "Claim_Date", "Service_Date",
        "Provider_Type", "Provider_Specialty", "Service_Type", "Hospital_ID",
        "Diagnosis_Code", "Claim_Status",
    ]
    subset = DATA.loc[:, columns].head(limit).copy()
    rows = []
    for row in subset.to_dict(orient="records"):
        rows.append({
            "claim_id": row.get("Claim_ID"),
            "policy_number": row.get("Policy_Number"),
            "claim_amount": float(row["Claim_Amount"]) if pd.notna(row.get("Claim_Amount")) else None,
            "claim_date": str(pd.to_datetime(row.get("Claim_Date")).date()) if pd.notna(row.get("Claim_Date")) else None,
            "service_date": str(pd.to_datetime(row.get("Service_Date")).date()) if pd.notna(row.get("Service_Date")) else None,
            "provider_type": row.get("Provider_Type"),
            "provider_specialty": row.get("Provider_Specialty"),
            "service_type": row.get("Service_Type"),
            "hospital_id": row.get("Hospital_ID"),
            "diagnosis_code": row.get("Diagnosis_Code"),
            "claim_status": row.get("Claim_Status"),
        })
    return jsonify(claims=rows, count=len(rows))


@app.get("/api/claim-documents")
def list_claim_documents():
    return jsonify(claim_documents=CLAIM_STORE.list_documents(rag_owner_id()))


@app.post("/api/claim-documents")
def upload_claim_document():
    upload = request.files.get("file")
    if upload is None:
        return jsonify(error="Choose a PDF, TXT, DOCX, or image file for claim extraction."), 400
    content = upload.stream.read(MAX_FILE_BYTES + 1)
    try:
        document = CLAIM_STORE.upload_document(rag_owner_id(), upload.filename, content, upload.mimetype or "application/octet-stream")
    except ClaimExtractionError as exc:
        return jsonify(error=str(exc)), 422
    return jsonify(claim_document=document), 201


@app.get("/api/claim-documents/<document_id>")
def get_claim_document(document_id):
    document = CLAIM_STORE._one_document(rag_owner_id(), document_id)
    if document is None:
        return jsonify(error="Claim document not found."), 404
    if document.get("raw_extraction"):
        document["raw_extraction"] = json.loads(document["raw_extraction"])
    if document.get("corrected_extraction"):
        document["corrected_extraction"] = json.loads(document["corrected_extraction"])
    if document.get("validation_errors"):
        document["validation_errors"] = json.loads(document["validation_errors"])
    return jsonify(claim_document=document)


@app.post("/api/claim-documents/<document_id>/review")
def review_claim_document(document_id):
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(error="Send a JSON object containing the corrected field values."), 400
    try:
        document = CLAIM_STORE.update_document(rag_owner_id(), document_id, payload)
    except ClaimExtractionError as exc:
        return jsonify(error=str(exc)), 404 if "not found" in str(exc).lower() else 422
    return jsonify(claim_document=document)


@app.delete("/api/claim-documents/<document_id>")
def delete_claim_document(document_id):
    if not CLAIM_STORE.delete_document(rag_owner_id(), document_id):
        return jsonify(error="Claim document not found."), 404
    return jsonify(deleted=True, document_id=document_id)


@app.post("/api/chat")
def document_chat():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(error="Send a JSON object containing a question."), 400
    question = payload.get("question")
    if not isinstance(question, str) or not question.strip() or len(question) > 2000:
        return jsonify(error="Question must contain 1 to 2,000 characters."), 400
    document_ids = payload.get("document_ids")
    if document_ids is not None and (
        not isinstance(document_ids, list)
        or len(document_ids) > 100
        or not all(isinstance(value, str) for value in document_ids)
    ):
        return jsonify(error="document_ids must be a list of at most 100 document IDs."), 400
    try:
        top_k = int(payload.get("top_k", os.environ.get("RAG_TOP_K", DEFAULT_TOP_K)))
        min_score = float(payload.get("min_score", os.environ.get("RAG_MIN_SCORE", DEFAULT_MIN_SCORE)))
        if top_k < 1 or top_k > 10 or not 0 <= min_score <= 1:
            raise ValueError
        result = RAG_STORE.answer(rag_owner_id(), question.strip(), document_ids, top_k, min_score)
    except DocumentError as exc:
        return jsonify(error=str(exc)), 400
    except (TypeError, ValueError, OverflowError):
        return jsonify(error="top_k must be 1-10 and min_score must be between 0 and 1."), 400
    return jsonify(result)


@app.post("/api/policy-verification")
def policy_verification():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(error="Send a JSON object with a policy_document_id and claim fields."), 400

    policy_document_id = payload.get("policy_document_id")
    if not isinstance(policy_document_id, str) or not policy_document_id.strip():
        return jsonify(error="policy_document_id is required."), 400

    claim_fields = payload.get("claim_fields")
    if not isinstance(claim_fields, dict):
        return jsonify(error="claim_fields must be an object containing claim values."), 400

    result = verify_claim_against_policy(rag_owner_id(), policy_document_id, claim_fields, RAG_STORE)
    return jsonify(result)


@app.post("/api/duplicate-claims")
def duplicate_claims():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(error="Send a JSON object with a claim and a comparison dataset."), 400

    claim = payload.get("claim")
    comparisons = payload.get("comparisons")
    if not isinstance(claim, dict):
        return jsonify(error="claim must be an object."), 400
    if comparisons is None:
        comparisons = []
    if not isinstance(comparisons, list):
        return jsonify(error="comparisons must be a list of claim records."), 400

    exact_threshold = payload.get("exact_threshold", 0.96)
    near_threshold = payload.get("near_threshold", 0.82)
    try:
        exact_threshold = float(exact_threshold)
        near_threshold = float(near_threshold)
    except (TypeError, ValueError):
        return jsonify(error="thresholds must be numeric."), 400

    result = find_duplicate_claims(claim, comparisons, exact_threshold=exact_threshold, near_threshold=near_threshold)
    return jsonify(result)


@app.post("/api/anomaly-detection")
def anomaly_detection():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(error="Send a JSON object with a claims dataset."), 400

    claims = payload.get("claims")
    group_by = payload.get("group_by")
    min_group_size = payload.get("min_group_size", 20)
    if claims is None:
        return jsonify(error="claims is required."), 400
    if not isinstance(claims, list):
        return jsonify(error="claims must be a list of claim records."), 400
    if group_by is not None and not isinstance(group_by, list):
        return jsonify(error="group_by must be a list of column names when provided."), 400
    try:
        min_group_size = int(min_group_size)
    except (TypeError, ValueError):
        return jsonify(error="min_group_size must be an integer."), 400

    result = detect_claim_anomalies(claims, group_by=group_by, min_group_size=max(1, min_group_size))
    return jsonify(result)


@app.get("/fields")
def fields():
    return jsonify(fields=RAW_FIELDS, categorical=CATEGORICAL)


@app.get("/fields-status")
def fields_status():
    if status_model is None:
        return jsonify(error="Claim-status model not found. Run ml/claim_status_model.py "
                             "to train it, then restart the API."), 503
    return jsonify(fields=STATUS_RAW_FIELDS, categorical=STATUS_CATEGORICAL,
                   classes=list(status_label_encoder.classes_))


@app.post("/predict")
def predict():
    if model is None:
        return jsonify(error="Fraud model is not available; training is required before predictions can run."), 503

    payload = request.get_json(silent=True)
    if payload is None:
        return jsonify(error="Send a JSON body (one claim or a list of claims)."), 400

    if isinstance(payload, dict) and "claims" in payload:
        payload = payload["claims"]
    records = [payload] if isinstance(payload, dict) else payload
    if not isinstance(records, list) or not records or not all(isinstance(r, dict) for r in records):
        return jsonify(error="Body must be a claim object, a list of claim objects, "
                             "or {\"claims\": [...]}."), 400
    if len(records) > MAX_BATCH:
        return jsonify(error=f"Send at most {MAX_BATCH} claims per request."), 400

    try:
        X = prepare(records)
        probs = model.predict_proba(X)[:, 1]
    except Exception as exc:           # bad values the model cannot handle
        return jsonify(error=f"Could not score the claim(s): {exc}"), 422

    results = [
        {
            "fraud_probability": round(float(p), 4),
            "is_fraud": bool(p >= THRESHOLD),
            "risk_level": risk_level(p),
        }
        for p in probs
    ]

    # /predict?explain=1 adds a SHAP explanation (single claim only)
    if request.args.get("explain") and len(records) == 1:
        try:
            results[0]["explanation"] = explain_claim(model, X, CATEGORICAL)
        except Exception as exc:       # e.g. shap not installed: still return the score
            results[0]["explanation"] = None
            results[0]["explanation_error"] = f"{type(exc).__name__}: {exc}"

    return jsonify(threshold=THRESHOLD, count=len(results), results=results)


@app.post("/predict-status")
def predict_status():
    if status_model is None:
        return jsonify(error="Claim-status model not found. Run ml/claim_status_model.py "
                             "to train it, then restart the API."), 503

    payload = request.get_json(silent=True)
    if payload is None:
        return jsonify(error="Send a JSON body (one claim or a list of claims)."), 400

    if isinstance(payload, dict) and "claims" in payload:
        payload = payload["claims"]
    records = [payload] if isinstance(payload, dict) else payload
    if not isinstance(records, list) or not records or not all(isinstance(r, dict) for r in records):
        return jsonify(error="Body must be a claim object, a list of claim objects, "
                             "or {\"claims\": [...]}."), 400
    if len(records) > MAX_BATCH:
        return jsonify(error=f"Send at most {MAX_BATCH} claims per request."), 400

    try:
        X = prepare(records, STATUS_EXPECTED_COLUMNS, STATUS_NUMERIC, STATUS_CATEGORICAL)
        probs = status_model.predict_proba(X)
        preds = probs.argmax(axis=1)
    except Exception as exc:           # bad values the model cannot handle
        return jsonify(error=f"Could not score the claim(s): {exc}"), 422

    classes = list(status_label_encoder.classes_)
    results = [
        {
            "predicted_status": classes[pred],
            "probabilities": {cls: round(float(p), 4) for cls, p in zip(classes, prob_row)},
        }
        for pred, prob_row in zip(preds, probs)
    ]
    return jsonify(count=len(results), results=results)


@app.get("/api/stats")
def api_stats():
    missing = need_data()
    if missing:
        return missing
    if "stats" not in _cache:
        _cache["stats"] = build_stats()
    return jsonify(_cache["stats"])


@app.get("/api/provider-risk")
def api_provider_risk():
    missing = need_data()
    if missing:
        return missing
    if "provider_risk" not in _cache:
        _cache["provider_risk"] = build_provider_risk()
    rows = _cache["provider_risk"]

    trend_filter = request.args.get("trend")  # e.g. ?trend=Rising
    if trend_filter:
        rows = [r for r in rows if r["trend"].lower() == trend_filter.lower()]

    limit = min(max(request.args.get("limit", 50, type=int), 1), 500)
    return jsonify(count=len(rows[:limit]), total_providers=len(rows), providers=rows[:limit])


@app.get("/api/loss-ratio")
def api_loss_ratio():
    missing = need_data()
    if missing:
        return missing
    if "loss_ratio" not in _cache:
        _cache["loss_ratio"] = build_loss_ratio()
    return jsonify(_cache["loss_ratio"])


@app.get("/api/analytics")
def api_analytics():
    """Monthly claim activity + Random Forest risk scores + held-out evaluation metrics."""
    missing = need_data()
    if missing:
        return missing
    if "analytics" not in _cache:
        d = DATA.dropna(subset=["Claim_Date"])
        g = d.groupby(d["Claim_Date"].dt.to_period("M"))["Is_Fraudulent"].agg(["size", "mean"])
        monthly = [{"month": str(p), "claims": int(r["size"]), "fraud_rate": round(float(r["mean"]), 4)}
                   for p, r in g.iterrows()]

        model_info = None
        try:
            held = scored_data()
            held = held[held["is_test"]]
            flagged = held["fraud_prob"] >= THRESHOLD
            actual = held["Is_Fraudulent"] == 1
            caught = int((flagged & actual).sum())
            levels = held["fraud_prob"].map(risk_level).value_counts()
            model_info = {
                "threshold": THRESHOLD,
                "n": int(len(held)),
                "flagged": int(flagged.sum()),
                "precision": round(caught / max(int(flagged.sum()), 1), 4),
                "recall": round(caught / max(int(actual.sum()), 1), 4),
                "avg_risk_score": round(float(held["fraud_prob"].mean()), 4),
                "risk_levels": {k: int(levels.get(k, 0)) for k in ("High", "Medium", "Low")},
            }
        except RuntimeError:           # fraud model not trained yet: still return monthly data
            pass
        _cache["analytics"] = {"monthly": monthly, "model": model_info}
    return jsonify(_cache["analytics"])


@app.get("/api/options")
def api_options():
    missing = need_data()
    if missing:
        return missing
    cols = ["Provider_Type", "Provider_Specialty", "Service_Type", "Admission_Type",
            "Discharge_Type", "Patient_Gender"]
    return jsonify({c: sorted(DATA[c].dropna().astype(str).unique().tolist()) for c in cols})


@app.get("/api/sample-claim")
def api_sample_claim():
    missing = need_data()
    if missing:
        return missing
    scored = scored_data()
    row = scored[scored["is_test"]].sample(1).iloc[0]   # only claims the model never saw
    claim = {k: (v.item() if hasattr(v, "item") else v) for k, v in row.items()
             if k not in ("fraud_prob", "is_test")}
    claim["Claim_Date"] = str(row["Claim_Date"].date())
    for col in ("Service_Date", "Policy_Expiration_Date"):
        claim[col] = str(pd.to_datetime(row[col]).date())
    labelled = bool(claim.pop("Is_Fraudulent"))
    claim_id = claim.get("Claim_ID")
    for col in ("Claim_ID", "Patient_ID", "Policy_Number"):
        claim.pop(col, None)
    return jsonify(claim=claim, labelled_fraud=labelled, claim_id=claim_id)


@app.get("/api/top-claims")
def api_top_claims():
    missing = need_data()
    if missing:
        return missing
    limit = min(max(request.args.get("limit", 25, type=int), 1), 200)
    scope = request.args.get("scope", "test")          # "test" = claims the model never saw
    pool = scored_data()
    if scope == "test":
        pool = pool[pool["is_test"]]
    top = pool.sort_values("fraud_prob", ascending=False).head(limit)
    rows = [{
        "claim_id": int(r.Claim_ID),
        "provider_type": r.Provider_Type,
        "specialty": r.Provider_Specialty,
        "service_type": r.Service_Type,
        "claim_amount": round(float(r.Claim_Amount), 2),
        "procedures": int(r.Number_of_Procedures),
        "distance_miles": round(float(r.Provider_Patient_Distance_Miles), 1),
        "probability": round(float(r.fraud_prob), 4),
        "risk_level": risk_level(r.fraud_prob),
        "labelled_fraud": bool(r.Is_Fraudulent),
    } for r in top.itertuples()]
    return jsonify(threshold=THRESHOLD, scope=scope, pool=int(len(pool)), count=len(rows), claims=rows)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)