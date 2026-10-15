import unittest

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

try:
    import shap  # noqa: F401
    from api.explainability import explain_claim
    SHAP_READY = True
except ImportError:
    SHAP_READY = False


def _tiny_model():
    rng = np.random.default_rng(0)
    n = 400
    df = pd.DataFrame({
        "Claim_Amount": rng.uniform(100, 10000, n),
        "Processing_Days": rng.integers(1, 40, n).astype(float),
        "Provider_Type": rng.choice(["Hospital", "Clinic", "Lab"], n),
    })
    # fraud mostly when processing takes long and the amount is large
    y = ((df["Processing_Days"] > 25) & (df["Claim_Amount"] > 5000)).astype(int)
    numeric, categorical = ["Claim_Amount", "Processing_Days"], ["Provider_Type"]
    pre = ColumnTransformer([
        ("numeric", Pipeline([("imputer", SimpleImputer(strategy="median"))]), numeric),
        ("categorical", Pipeline([
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("encoder", OneHotEncoder(handle_unknown="ignore")),
        ]), categorical),
    ])
    model = Pipeline([("preprocessor", pre),
                      ("classifier", RandomForestClassifier(n_estimators=30, random_state=0))])
    model.fit(df, y)
    return model, df, categorical


@unittest.skipUnless(SHAP_READY, "shap not installed")
class ExplainabilityTests(unittest.TestCase):
    def setUp(self):
        self.model, self.df, self.categorical = _tiny_model()

    def test_top_factor_is_a_known_driver_and_one_hot_columns_are_merged(self):
        claim = pd.DataFrame([{"Claim_Amount": 9000.0, "Processing_Days": 35.0, "Provider_Type": "Hospital"}])
        result = explain_claim(self.model, claim, self.categorical, top_n=3)
        names = [f["feature"] for f in result["factors"]]
        self.assertIn(names[0], {"Processing_Days", "Claim_Amount"})
        self.assertIn("Provider_Type", [f["feature"] for f in explain_claim(self.model, claim, self.categorical, top_n=10)["factors"]])
        self.assertFalse(any(n.startswith("Provider_Type_") for n in names))
        self.assertEqual(result["factors"][0]["direction"], "increases")

    def test_contributions_add_up_to_the_model_probability(self):
        claim = pd.DataFrame([{"Claim_Amount": 9000.0, "Processing_Days": 35.0, "Provider_Type": "Lab"}])
        result = explain_claim(self.model, claim, self.categorical, top_n=10)
        total = result["base_value"] + sum(f["impact"] for f in result["factors"])
        expected = float(self.model.predict_proba(claim)[0, 1])
        self.assertAlmostEqual(total, expected, places=2)

    def test_missing_value_is_reported_as_none(self):
        claim = pd.DataFrame([{"Claim_Amount": np.nan, "Processing_Days": 10.0, "Provider_Type": "Clinic"}])
        result = explain_claim(self.model, claim, self.categorical, top_n=10)
        amount = next(f for f in result["factors"] if f["feature"] == "Claim_Amount")
        self.assertIsNone(amount["value"])


if __name__ == "__main__":
    unittest.main()