"""
Claim Status Prediction Model
------------------------------
A SEPARATE model from the fraud classifier (fraud_model.py). This one predicts
how a claim will be processed: "Approved", "Rejected", or "Under Review".

Why this is useful on its own:
- Lets ops teams anticipate processing outcomes before a human reviews the claim
- Different audience (claims processing / operations) than the fraud model
  (fraud / investigations)
- Uses Is_Fraudulent as an INPUT feature here (not a leak) because the fraud
  label is a legitimate real-world signal available before a claim is
  processed, and we are no longer predicting fraud itself.

Run:
    python ml/claim_status_model.py
Saves:
    ml/claim_status_model.joblib
"""

import pandas as pd
from pathlib import Path
import joblib

from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, LabelEncoder
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score

# 1. Load the cleaned dataset (same cleaned file the fraud model uses)
df = pd.read_csv("data/processed/health_claims_clean.csv")
df = df.dropna(subset=["Claim_Status"]).copy()

print("Dataset shape:", df.shape)
print("\nClaim_Status distribution:")
print(df["Claim_Status"].value_counts())

# 2. Target: Claim_Status (3 classes)
y = df["Claim_Status"]
label_encoder = LabelEncoder()
y_encoded = label_encoder.fit_transform(y)

# 3. Features: drop identifiers and the target itself.
#    NOTE: Is_Fraudulent is KEPT as a feature here on purpose -- see docstring.
drop_columns = [
    "Claim_Status",
    "Claim_ID",
    "Patient_ID",
    "Policy_Number",
    "Processing_Days"   # known only after processing -> leaks the label
]

X = df.drop(
    columns=[c for c in drop_columns if c in df.columns]
).copy()

# 4. Convert date columns into numeric features
date_columns = [
    "Claim_Date",
    "Service_Date",
    "Policy_Expiration_Date",
    "Policy_Start_Date",
]

for col in date_columns:
    if col in X.columns:
        dates = pd.to_datetime(X[col], errors="coerce")
        X[col + "_Year"] = dates.dt.year
        X[col + "_Month"] = dates.dt.month
        X[col + "_Day"] = dates.dt.day
        X = X.drop(columns=[col])

# 5. Identify numeric and categorical features
numeric_columns = X.select_dtypes(
    include=["number", "bool"]
).columns.tolist()

categorical_columns = X.select_dtypes(
    include=["object", "category"]
).columns.tolist()

# 6. Preprocessing: impute + one-hot encode
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

# 7. Model: Random Forest (multi-class, balanced)
model = Pipeline([
    ("preprocessor", preprocessor),
    ("classifier", RandomForestClassifier(
        n_estimators=200,
        random_state=42,
        class_weight="balanced",
        n_jobs=-1
    ))
])

# 8. Train / test split
X_train, X_test, y_train, y_test = train_test_split(
    X, y_encoded,
    test_size=0.2,
    random_state=42,
    stratify=y_encoded
)

print("\nTraining rows:", len(X_train))
print("Testing rows:", len(X_test))

# 9. Train
print("\nTraining claim status model...")
model.fit(X_train, y_train)

# 10. Evaluate
predictions = model.predict(X_test)

print("\nAccuracy:", round(accuracy_score(y_test, predictions), 3))
print("\nClassification report:")
print(classification_report(
    y_test, predictions,
    target_names=label_encoder.classes_,
    zero_division=0
))
print("Confusion matrix (rows=actual, cols=predicted):")
print("Classes order:", list(label_encoder.classes_))
print(confusion_matrix(y_test, predictions))

# 11. Save model + label encoder together
output_dir = Path("ml")
output_dir.mkdir(parents=True, exist_ok=True)

joblib.dump(
    {"model": model, "label_encoder": label_encoder},
    output_dir / "claim_status_model.joblib"
)

print("\nModel saved to ml/claim_status_model.joblib")
print("Training completed successfully!")