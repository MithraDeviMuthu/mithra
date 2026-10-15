
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
    accuracy_score,
    classification_report,
    confusion_matrix
)

# 1. Load the cleaned dataset
df = pd.read_csv("data/processed/health_claims_clean.csv")
df = df.dropna(subset=["Is_Fraudulent"]).copy()
df["Is_Fraudulent"] = df["Is_Fraudulent"].astype(int)

print("Dataset shape:", df.shape)

# 2. Separate target from input features
y = df["Is_Fraudulent"]

drop_columns = [
    "Is_Fraudulent",
    "Claim_ID",
    "Patient_ID",
    "Policy_Number",
    "Claim_Status"
]

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
    include=["object", "category"]
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

# 7. Split data into training and testing sets
X_train, X_test, y_train, y_test = train_test_split(
    X, y,
    test_size=0.2,
    random_state=42,
    stratify=y
)

print("Training rows:", len(X_train))
print("Testing rows:", len(X_test))

# 8. Train the model
print("\nTraining model...")
model.fit(X_train, y_train)

# 9. Evaluate the model on test data
from sklearn.metrics import roc_auc_score, precision_score, recall_score, f1_score

proba = model.predict_proba(X_test)[:, 1]
print("ROC-AUC:", round(roc_auc_score(y_test, proba), 3))

print("\nThreshold  Precision  Recall  F1")
for t in [0.5, 0.4, 0.35, 0.3, 0.25, 0.2]:
    pred = (proba >= t).astype(int)
    print(f"{t:<10} {precision_score(y_test, pred):<10.2f} "
          f"{recall_score(y_test, pred):<7.2f} {f1_score(y_test, pred):.2f}")

THRESHOLD = 0.4          # choose from the table above
predictions = (proba >= THRESHOLD).astype(int)
print(classification_report(y_test, predictions, zero_division=0))
print(confusion_matrix(y_test, predictions))
# 10. Save the trained model
output_dir = Path("ml")
output_dir.mkdir(parents=True, exist_ok=True)

joblib.dump(model, output_dir / "health_claims_model.joblib")

print("\nModel saved to ml/health_claims_model.joblib")
print("Training completed successfully!")
