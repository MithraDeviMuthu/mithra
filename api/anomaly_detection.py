from __future__ import annotations

import pandas as pd

DEFAULT_GROUP_BY = ["Provider_Type", "Service_Type"]
DEFAULT_MIN_GROUP_SIZE = 20


def _normalize_group_name(value):
    if value is None or pd.isna(value):
        return "unknown"
    text = str(value).strip()
    return text if text else "unknown"


def _amount_series(frame):
    if frame is None or frame.empty:
        return pd.Series(dtype=float)
    return pd.to_numeric(frame, errors="coerce").dropna()


def detect_claim_anomalies(claims, group_by=None, min_group_size=DEFAULT_MIN_GROUP_SIZE):
    """Flag claim amounts that stand out relative to a relevant comparison group.

    The method is intentionally robust: it compares a claim amount to the median and
    IQR of its group. When a group is too small, it falls back to the global baseline
    and records that fallback in the output so reviewers understand the limitation.
    """
    if claims is None:
        return {"status": "no_data", "count": 0, "anomalies": []}

    if isinstance(claims, list):
        frame = pd.DataFrame(claims)
    elif isinstance(claims, pd.DataFrame):
        frame = claims.copy()
    else:
        raise TypeError("claims must be a pandas DataFrame or list of dictionaries.")

    if frame.empty:
        return {"status": "no_data", "count": 0, "anomalies": []}

    if group_by is None:
        group_by = DEFAULT_GROUP_BY
    group_by = [col for col in list(group_by) if col and col in frame.columns]
    if not group_by:
        group_by = ["Provider_Type"]

    df = frame.copy()
    if "Claim_Amount" not in df.columns:
        return {"status": "no_data", "count": 0, "anomalies": []}

    df["Claim_Amount"] = pd.to_numeric(df["Claim_Amount"], errors="coerce")
    df = df.dropna(subset=["Claim_Amount"]).copy()

    if df.empty:
        return {"status": "no_data", "count": 0, "anomalies": []}

    global_values = df["Claim_Amount"].dropna()
    global_median = float(global_values.median())
    global_q1 = float(global_values.quantile(0.25))
    global_q3 = float(global_values.quantile(0.75))
    global_iqr = max(float(global_q3 - global_q1), 1.0)
    global_upper = float(global_q3 + 3 * global_iqr)

    anomalies = []
    for _, row in df.iterrows():
        amount = float(row["Claim_Amount"])
        group_keys = {col: _normalize_group_name(row.get(col)) for col in group_by}
        group_mask = pd.Series(True, index=df.index)
        for key, value in group_keys.items():
            group_mask &= df[key].fillna("unknown").astype(str).eq(value)
        comparison_df = df[group_mask]

        if len(comparison_df) >= min_group_size:
            reference = comparison_df["Claim_Amount"].dropna()
            used_global = False
            comparison_label = "; ".join(f"{key}={val}" for key, val in group_keys.items())
        else:
            reference = global_values
            used_global = True
            comparison_label = "global baseline"

        if reference.empty:
            continue

        median = float(reference.median())
        q1 = float(reference.quantile(0.25))
        q3 = float(reference.quantile(0.75))
        iqr = max(float(q3 - q1), 1.0)
        upper = float(q3 + 3 * iqr)
        lower = float(q1 - 1.5 * iqr)

        if amount <= max(upper, global_upper):
            continue

        delta = amount - median
        if iqr > 0:
            score = delta / iqr
        else:
            score = 0.0
        if score >= 3.0:
            severity = "High"
        elif score >= 1.5:
            severity = "Medium"
        else:
            severity = "Low"

        anomalies.append({
            "claim_id": row.get("Claim_ID", row.name),
            "claim_amount": round(float(amount), 2),
            "severity": severity,
            "score": round(float(score), 4),
            "group": comparison_label,
            "fallback_to_global": used_global,
            "comparison": {
                "median": round(float(median), 2),
                "q1": round(float(q1), 2),
                "q3": round(float(q3), 2),
                "iqr": round(float(iqr), 2),
                "upper_threshold": round(float(upper), 2),
                "amount_vs_threshold": round(float(amount - upper), 2),
            },
            "reason": (
                "Claim amount exceeds the comparison group's robust threshold and should be reviewed manually; "
                f"current amount {amount:.2f} versus group median {median:.2f} and upper bound {upper:.2f}."
            ),
        })

    anomalies.sort(key=lambda item: (-item["score"], -item["claim_amount"]))
    return {
        "status": "review_candidates" if anomalies else "clear",
        "count": len(anomalies),
        "comparison_groups": group_by,
        "anomalies": anomalies,
    }


__all__ = ["DEFAULT_GROUP_BY", "DEFAULT_MIN_GROUP_SIZE", "detect_claim_anomalies"]
