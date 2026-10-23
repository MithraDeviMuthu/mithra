import numpy as np
import pandas as pd
from pathlib import Path
import joblib

from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    roc_auc_score,
    average_precision_score,
    f1_score
)

# 1. Load the cleaned dataset
df = pd.read_csv("data/processed/health_claims_clean.csv")
df = df.dropna(subset=["Is_Fraudulent"]).copy()
df["Is_Fraudulent"] = df["Is_Fraudulent"].astype(int)

print("Dataset shape:", df.shape)

# 2. Separate target from input features
y = df["Is_Fraudulent"]

# Processing_Days is only known AFTER a claim is handled, so it leaks the label
drop_columns = ["Is_Fraudulent", "Claim_ID", "Patient_ID", "Policy_Number",
                "Claim_Status", "Processing_Days"]

X = df.drop(
    columns=[c for c in drop_columns if c in df.columns]
).copy()

# 3. Convert date columns into numeric features
date_columns = [
    "Claim_Date",
    "Service_Date",
    "Policy_Expiration_Date",
    "Policy_Start_Date"
]
for col in date_columns:
    if col in X.columns:
        dates = pd.to_datetime(X[col], errors="coerce")
        X[col + "_Year"] = dates.dt.year
        X[col + "_Month"] = dates.dt.month
        X[col + "_Day"] = dates.dt.day
        X = X.drop(columns=[col])

# 4. Identify numeric and categorical features
numeric_columns = X.select_dtypes(
    include=["number", "bool"]
).columns.tolist()

categorical_columns = X.select_dtypes(
    include=["object", "category", "string"]
).columns.tolist()

# 5. Prepare missing values and encode text
numeric_pipeline = Pipeline([
    ("imputer", SimpleImputer(strategy="median"))
])

categorical_pipeline = Pipeline([
    ("imputer", SimpleImputer(strategy="most_frequent")),
    ("encoder", OneHotEncoder(handle_unknown="ignore"))
])

preprocessor = ColumnTransformer([
    ("numeric", numeric_pipeline, numeric_columns),
    ("categorical", categorical_pipeline, categorical_columns)
])

# 6. Build the Random Forest model
model = Pipeline([
    ("preprocessor", preprocessor),
    ("classifier", RandomForestClassifier(
        n_estimators=100,
        random_state=42,
        class_weight="balanced",
        n_jobs=-1
    ))
])

# 7. Split: 20% test (same split app.py expects), then 20% of the rest for validation
X_temp, X_test, y_temp, y_test = train_test_split(
    X, y,
    test_size=0.2,
    random_state=42,
    stratify=y
)
X_train, X_val, y_train, y_val = train_test_split(
    X_temp, y_temp,
    test_size=0.25,
    random_state=42,
    stratify=y_temp
)

print("Training rows:", len(X_train))
print("Validation rows:", len(X_val))
print("Testing rows:", len(X_test))

# 8. Train the model
print("\nTraining model...")
model.fit(X_train, y_train)

# 9. Choose the threshold on VALIDATION data (never on the test set)
# Finer grid (step 0.01 instead of 6 hand-picked points) so F1 can be
# maximized more precisely.
val_proba = model.predict_proba(X_val)[:, 1]
ts = np.arange(0.05, 0.60, 0.01)
THRESHOLD = float(max(
    ts,
    key=lambda t: f1_score(y_val, (val_proba >= t).astype(int))
))
print("Chosen threshold (validation):", THRESHOLD)

# 9b. Calibrate the "medium risk" cutoff from validation data instead of
# hard-coding it as half of THRESHOLD. MEDIUM is the highest cutoff that
# still catches at least 90% of actual fraud cases in validation ("recall
# floor"), capped at THRESHOLD so medium never exceeds the high-risk cutoff.
fraud_scores = val_proba[(y_val == 1).values]
MEDIUM = float(max(
    (t for t in ts if (fraud_scores >= t).mean() >= 0.90),
    default=THRESHOLD / 2  # fallback only if no threshold reaches 90% recall
))
MEDIUM = min(MEDIUM, THRESHOLD)
print("Chosen medium-risk threshold (validation):", MEDIUM)

# 10. Evaluate ONCE on the test data
proba = model.predict_proba(X_test)[:, 1]
print("Test ROC-AUC:", round(roc_auc_score(y_test, proba), 3))
print("Test PR-AUC:", round(average_precision_score(y_test, proba), 3))

predictions = (proba >= THRESHOLD).astype(int)
print(classification_report(y_test, predictions, zero_division=0))
print(confusion_matrix(y_test, predictions))

# 11. Save the model together with its thresholds
output_dir = Path("ml")
output_dir.mkdir(parents=True, exist_ok=True)

joblib.dump(
    {"model": model, "threshold": THRESHOLD, "medium_threshold": MEDIUM},
    output_dir / "health_claims_model.joblib"
)

print("\nModel saved to ml/health_claims_model.joblib")
print("Training completed successfully!")