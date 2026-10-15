
import re
from datetime import datetime
from difflib import SequenceMatcher

DEFAULT_EXACT_THRESHOLD = 0.96
DEFAULT_NEAR_THRESHOLD = 0.82


def _normalize_text(value):
    if value is None:
        return ""
    text = str(value).strip().lower().replace("_", " ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _parse_amount(value):
    if value is None or value == "" or str(value).lower() in {"unavailable", "nan", "none"}:
        return None
    candidate = str(value).replace("$", "").replace(",", "").strip()
    match = re.search(r"-?\d+(?:\.\d+)?", candidate)
    if not match:
        return None
    return float(match.group(0))


def _parse_date(value):
    if value is None or value == "" or str(value).lower() in {"unavailable", "nan", "none"}:
        return None
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(text).date()
    except ValueError:
        return None


def _field_value(obj, *names):
    if not isinstance(obj, dict):
        return None
    for name in names:
        if name in obj and obj[name] not in (None, "", "unavailable"):
            return obj[name]
    return None


def _text_similarity(left, right):
    left_norm = _normalize_text(left)
    right_norm = _normalize_text(right)
    if not left_norm and not right_norm:
        return 0.0
    if left_norm == right_norm:
        return 1.0
    if not left_norm or not right_norm:
        return 0.0
    return SequenceMatcher(None, left_norm, right_norm).ratio()


def _match_reason(field_name, left, right, score):
    left_text = str(left).strip() if left is not None else ""
    right_text = str(right).strip() if right is not None else ""
    return {
        "field": field_name,
        "details": f"{left_text} vs {right_text} (similarity {score:.2f})",
        "similarity": round(float(score), 4),
    }


def _field_matches(claim, reference):
    reasons = []
    score_total = 0.0
    weights = 0

    def add_match(field_name, claim_key, ref_key, weight=1.0, use_text=True):
        nonlocal score_total, weights
        claim_value = _field_value(claim, claim_key)
        ref_value = _field_value(reference, ref_key)
        if claim_value is None or ref_value is None:
            return
        if use_text:
            score = _text_similarity(claim_value, ref_value)
            if score > 0.6:
                reasons.append(_match_reason(field_name, claim_value, ref_value, score))
                score_total += score * weight
                weights += weight
        else:
            score = 1.0 if _normalize_text(claim_value) == _normalize_text(ref_value) else 0.0
            if score > 0.0:
                reasons.append(_match_reason(field_name, claim_value, ref_value, score))
                score_total += score * weight
                weights += weight

    add_match("policy_number", "policy_number", "Policy_Number", weight=2.5)
    add_match("claim_id", "claim_id", "Claim_ID", weight=2.5)
    add_match("claim_number", "claim_number", "Claim_ID", weight=2.5)
    add_match("invoice_number", "invoice_number", "Invoice_Number", weight=1.5)
    add_match("provider_name", "provider_name", "Provider_Name", weight=1.5)
    add_match("provider_name", "provider_name", "Hospital_ID", weight=1.0, use_text=False)

    claim_amount = _parse_amount(_field_value(claim, "claim_amount", "Claim_Amount"))
    ref_amount = _parse_amount(_field_value(reference, "Claim_Amount", "claim_amount"))
    if claim_amount is not None and ref_amount is not None:
        amount_ratio = 1.0 if ref_amount == 0 and claim_amount == 0 else abs(claim_amount - ref_amount) / max(abs(ref_amount), 1.0)
        score = 1.0 - min(amount_ratio, 1.0)
        if score >= 0.8:
            reasons.append({
                "field": "claim_amount",
                "details": f"Amount difference {abs(claim_amount - ref_amount):.2f} ({score:.2f} similarity)",
                "similarity": round(float(score), 4),
            })
            score_total += score * 2.0
            weights += 2.0

    claim_date = _parse_date(_field_value(claim, "service_date", "claim_date", "Claim_Date", "Service_Date"))
    ref_date = _parse_date(_field_value(reference, "Service_Date", "Claim_Date", "service_date", "claim_date"))
    if claim_date is not None and ref_date is not None:
        delta_days = abs((claim_date - ref_date).days)
        score = 1.0 if delta_days == 0 else max(0.0, 1.0 - (delta_days / 365.0))
        if score >= 0.7:
            reasons.append({
                "field": "service_date",
                "details": f"Date difference {delta_days} days ({score:.2f} similarity)",
                "similarity": round(float(score), 4),
            })
            score_total += score * 1.5
            weights += 1.5

    if weights == 0:
        return [], 0.0
    return reasons, score_total / weights


def find_duplicate_claims(claim, comparison_rows, *, exact_threshold=DEFAULT_EXACT_THRESHOLD, near_threshold=DEFAULT_NEAR_THRESHOLD):
    if not isinstance(claim, dict):
        raise TypeError("claim must be a dictionary.")
    if comparison_rows is None:
        comparison_rows = []

    candidates = []
    for index, reference in enumerate(comparison_rows):
        if not isinstance(reference, dict):
            continue
        reasons, match_score = _field_matches(claim, reference)
        if not reasons:
            continue

        has_exact_id_match = (
            _normalize_text(_field_value(claim, "policy_number", "Policy_Number")) == _normalize_text(_field_value(reference, "Policy_Number", "policy_number"))
            or _normalize_text(_field_value(claim, "claim_number", "Claim_ID")) == _normalize_text(_field_value(reference, "Claim_ID", "claim_number"))
            or _normalize_text(_field_value(claim, "claim_id", "Claim_ID")) == _normalize_text(_field_value(reference, "Claim_ID", "claim_id"))
        )

        if match_score >= exact_threshold or (has_exact_id_match and match_score >= near_threshold):
            match_type = "exact"
        elif match_score >= near_threshold:
            match_type = "near"
        else:
            continue

        candidates.append({
            "match_type": match_type,
            "score": round(float(match_score), 4),
            "reasons": reasons,
            "reference_record": {
                key: reference.get(key)
                for key in [
                    "Claim_ID",
                    "Policy_Number",
                    "Claim_Amount",
                    "Claim_Date",
                    "Service_Date",
                    "Provider_Type",
                    "Provider_Specialty",
                    "Hospital_ID",
                    "Diagnosis_Code",
                    "Procedure_Code",
                    "Policy_Type",
                ]
                if key in reference
            },
        })

    candidates.sort(key=lambda item: (-item["score"], item["match_type"]))
    return {
        "status": "review_candidates" if candidates else "clear",
        "count": len(candidates),
        "thresholds": {
            "exact": exact_threshold,
            "near": near_threshold,
        },
        "candidates": candidates,
    }


__all__ = ["DEFAULT_EXACT_THRESHOLD", "DEFAULT_NEAR_THRESHOLD", "find_duplicate_claims"]
