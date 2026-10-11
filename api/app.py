"""
Flask API + dashboard server for the Insurance Policy Analytics System.

Run (from the project root):
    pip install flask flask-cors
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
"""
import os
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from flask import Flask, jsonify, request, send_from_directory
from sklearn.model_selection import train_test_split

try:                                   # optional: lets a separate React app call this API
    from flask_cors import CORS
except ImportError:                    # pragma: no cover
    CORS = None

# ---------------------------------------------------------------- settings
PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = Path(os.environ.get("MODEL_PATH", PROJECT_ROOT / "ml" / "health_claims_model.joblib"))
DASHBOARD_DIR = next((d for d in (PROJECT_ROOT / "dashboard", PROJECT_ROOT / "frontend")
                      if (d / "index.html").exists()), PROJECT_ROOT / "dashboard")
DATA_CANDIDATES = [
    os.environ.get("DATA_PATH"),
    PROJECT_ROOT / "data" / "processed" / "health_claims_clean.csv",
    PROJECT_ROOT / "data" / "processed" / "claims_clean.csv",
]
DEFAULT_THRESHOLD = 0.30               # used if the saved model file has no threshold
DATE_COLUMNS = ["Claim_Date", "Service_Date", "Policy_Expiration_Date"]
MAX_BATCH = 1000
MIN_GROUP = 100                        # hide chart groups with fewer claims than this
# These two must match the train_test_split() call in your model.py. They let the
# dashboard find the claims the model never saw during training.
TEST_SIZE = 0.2
RANDOM_STATE = 42

# ------------------------------------------------------------- load model
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
RAW_FIELDS = []
for col in EXPECTED_COLUMNS:
    base = next((d for d in DATE_COLUMNS if col.startswith(d + "_")), None)
    name = base if base else col
    if name not in RAW_FIELDS:
        RAW_FIELDS.append(name)

app = Flask(__name__)
if CORS:
    CORS(app)


# ---------------------------------------------------------------- scoring
def prepare(records):
    """Turn raw claim dicts (or a DataFrame) into the exact columns the model was trained on."""
    df = pd.DataFrame(records)

    # same date handling as training: date -> year / month / day
    for col in DATE_COLUMNS:
        if col in df.columns:
            dates = pd.to_datetime(df[col], errors="coerce")
            df[col + "_Year"] = dates.dt.year
            df[col + "_Month"] = dates.dt.month
            df[col + "_Day"] = dates.dt.day

    df = df.reindex(columns=EXPECTED_COLUMNS)          # missing fields become NaN

    for col in NUMERIC:
        df[col] = pd.to_numeric(df[col], errors="coerce").astype(float)
    for col in CATEGORICAL:
        df[col] = df[col].astype(object).where(df[col].isna(), df[col].astype(str))
    return df


def risk_level(prob):
    if prob >= THRESHOLD:
        return "High"
    if prob >= THRESHOLD / 2:
        return "Medium"
    return "Low"


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


@app.get("/health")
def health():
    return jsonify(status="ok", model=MODEL_PATH.name, threshold=THRESHOLD,
                   n_input_features=len(EXPECTED_COLUMNS), data_loaded=DATA is not None)


@app.get("/fields")
def fields():
    return jsonify(fields=RAW_FIELDS, categorical=CATEGORICAL)


@app.post("/predict")
def predict():
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
        probs = model.predict_proba(prepare(records))[:, 1]
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
    return jsonify(threshold=THRESHOLD, count=len(results), results=results)


@app.get("/api/stats")
def api_stats():
    missing = need_data()
    if missing:
        return missing
    if "stats" not in _cache:
        _cache["stats"] = build_stats()
    return jsonify(_cache["stats"])


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
