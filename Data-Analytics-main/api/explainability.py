"""SHAP explanations for the fraud model (a Random Forest inside a sklearn Pipeline).

SHAP splits one claim's fraud probability into per-feature contributions:
    base rate + sum(contributions) = this claim's fraud probability
Contributions are in probability points (0.10 = +10 percentage points).
One-hot columns are added back together, so "Provider_Type" shows as one factor
instead of many "Provider_Type_<value>" columns.
"""
import numpy as np
import pandas as pd

_explainers = {}


def _explainer(model):
    key = id(model)
    if key not in _explainers:
        import shap  # imported here so the app still starts without shap installed
        _explainers[key] = shap.TreeExplainer(model.named_steps["classifier"])
    return _explainers[key]


def _source_column(feature_name, categorical):
    """Map a transformed column name back to the claim field it came from."""
    name = feature_name.split("__", 1)[-1]
    if feature_name.startswith("categorical__"):
        for col in sorted(categorical, key=len, reverse=True):
            if name == col or name.startswith(col + "_"):
                return col
    return name


def _plain(value):
    if value is None or value != value:      # None or NaN
        return None
    return value.item() if hasattr(value, "item") else value


def explain_claim(model, claim_df, categorical, top_n=5):
    """Explain the first row of claim_df. Returns {"base_value", "factors"}."""
    pre = model.named_steps["preprocessor"]
    X = pre.transform(claim_df.iloc[[0]])
    if hasattr(X, "toarray"):                # sparse -> dense
        X = X.toarray()

    explainer = _explainer(model)
    values = explainer.shap_values(X)
    if isinstance(values, list):             # older shap: one array per class
        values = values[1]
    values = np.asarray(values)
    if values.ndim == 3:                     # newer shap: (rows, features, classes)
        values = values[:, :, 1]
    values = values[0]

    totals = {}
    for name, v in zip(pre.get_feature_names_out(), values):
        col = _source_column(name, categorical)
        totals[col] = totals.get(col, 0.0) + float(v)

    row = claim_df.iloc[0]
    ranked = sorted(totals.items(), key=lambda kv: abs(kv[1]), reverse=True)[:top_n]
    factors = [
        {
            "feature": col,
            "value": _plain(row.get(col)),
            "impact": round(impact, 4),
            "direction": "increases" if impact > 0 else "decreases",
        }
        for col, impact in ranked
    ]

    base = np.ravel(explainer.expected_value)
    base_value = float(base[1] if len(base) > 1 else base[0])
    return {"base_value": round(base_value, 4), "factors": factors}