
import pandas as pd
from pathlib import Path

# 1. Load the health insurance claims dataset
input_file = Path("data/raw/synthetic_health_claims.csv")

df = pd.read_csv(input_file)

print("Original dataset shape:", df.shape)

# 2. Check missing values
print("\nMissing values:")
print(df.isnull().sum())

# 3. Remove exact duplicate rows
duplicate_count = df.duplicated().sum()
df = df.drop_duplicates().copy()

print("\nExact duplicates removed:", duplicate_count)

# 4. Find claims with conflicting fraud labels
label_counts = df.groupby("Claim_ID")[
    "Is_Fraudulent"
].nunique(dropna=False)

conflicting_ids = label_counts[
    label_counts > 1
].index

# 5. Save conflicting claims for review
review_dir = Path("data/quality_review")
review_dir.mkdir(parents=True, exist_ok=True)

review = df[df["Claim_ID"].isin(conflicting_ids)]

review.to_csv(
    review_dir / "conflicting_claim_labels.csv",
    index=False
)

print("Conflicting claim IDs:", len(conflicting_ids))

# 6. Exclude conflicting claim IDs from training data
df = df[
    ~df["Claim_ID"].isin(conflicting_ids)
].copy()

# 7. Convert date columns
date_columns = [
    "Claim_Date",
    "Service_Date",
    "Policy_Expiration_Date"
]

for column in date_columns:
    df[column] = pd.to_datetime(
        df[column], errors="coerce"
    )

# 8. Convert fraud labels into numbers
df["Is_Fraudulent"] = (
    df["Is_Fraudulent"]
    .astype("string")
    .str.strip()
    .str.lower()
    .map({
        "true": 1,
        "false": 0,
        "1": 1,
        "0": 0
    })
)

# 9. Display fraud and non-fraud counts
print("\nFraud label counts:")
print(df["Is_Fraudulent"].value_counts(dropna=False))

# 10. Save the cleaned dataset
output_dir = Path("data/processed")
output_dir.mkdir(parents=True, exist_ok=True)

df.to_csv(
    output_dir / "health_claims_clean.csv",
    index=False
)

print("\nFinal dataset shape:", df.shape)
print("Cleaning completed successfully!")
