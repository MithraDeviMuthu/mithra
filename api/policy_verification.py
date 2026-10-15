import json
import re
from datetime import datetime

from api.rag import DocumentError

try:
    from .rag import RagStore
except ImportError:  # pragma: no cover - direct script execution
    from rag import RagStore


def _as_field_map(payload):
    if not isinstance(payload, dict):
        return {}
    if isinstance(payload.get("fields"), dict):
        return payload["fields"]
    return payload


def _clean(value):
    if value is None:
        return ""
    if value == "unavailable":
        return ""
    return str(value).strip()


def _collect_claim_text(claim_fields):
    values = []
    for key in [
        "diagnosis",
        "treatment",
        "provider_name",
        "policy_number",
        "claim_number",
        "invoice_number",
        "claim_amount",
        "service_date",
        "admission_date",
        "discharge_date",
        "invoice_date",
    ]:
        value = _clean(claim_fields.get(key))
        if value:
            values.append(f"{key.replace('_', ' ')} {value}")
    return " ".join(values)


def _parse_date(value):
    if not value:
        return None
    candidate = str(value).strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(candidate, fmt).date()
        except ValueError:
            continue
    return None


def _matches_number(pattern_value, text):
    if not pattern_value:
        return False
    return re.search(rf"(?:policy|claim|invoice)\s*(?:number|no|#)?\s*[:#-]?\s*{re.escape(str(pattern_value))}", text, flags=re.IGNORECASE) is not None


def _amount_number(value):
    if value in (None, "", "unavailable"):
        return None
    match = re.search(r"(\d[\d,]*\.?\d{0,2})", str(value).replace("$", ""))
    if not match:
        return None
    return float(match.group(1).replace(",", ""))


def _build_retrieval_questions(claim_fields):
    values = []
    for key in ["policy_number", "claim_number", "invoice_number", "provider_name", "claim_amount", "service_date", "diagnosis", "treatment"]:
        value = _clean(claim_fields.get(key))
        if value:
            values.append(f"{key.replace('_', ' ')} {value}")

    queries = []
    if values:
        queries.append("Find policy coverage, exclusions, waiting periods, limits, or required documents for " + "; ".join(values[:5]) + ".")
        queries.append("What does the policy say about coverage, waiting periods, exclusions, or limits for this claim? " + " ".join(values[:3]))
    else:
        queries.append("Find relevant policy coverage, exclusions, waiting periods, limits, and required documents for this claim.")
    return [q for q in queries if q.strip()]


def _passage_candidates(policy_result):
    sources = policy_result.get("sources") or []
    return [
        {
            "document_name": source.get("filename"),
            "page": source.get("page"),
            "section": source.get("section"),
            "quote": source.get("excerpt", ""),
            "score": source.get("score"),
        }
        for source in sources
    ]


def verify_claim_against_policy(owner_id, policy_document_id, claim_fields, rag_store):
    if rag_store is None:
        raise ValueError("A rag_store instance is required to verify a claim against a policy.")

    policy = rag_store.document_status(owner_id, policy_document_id)
    if policy is None:
        return {
            "status": "inconclusive",
            "document_name": None,
            "findings": [{
                "claim_field": "policy_document",
                "document_name": None,
                "page": None,
                "section": None,
                "quote": "Policy document not found or not available to this owner.",
                "reason": "No policy document was available for verification.",
                "status": "Inconclusive",
            }],
        }

    claim_fields = _as_field_map(claim_fields)
    queries = _build_retrieval_questions(claim_fields)
    aggregated = []
    seen = set()
    for query in queries:
        try:
            result = rag_store.answer(owner_id, query, [policy_document_id], top_k=5, min_score=0.05)
        except DocumentError:
            continue
        for item in _passage_candidates(result):
            key = (item["document_name"], item["page"], item["section"], item["quote"])
            if key not in seen:
                aggregated.append(item)
                seen.add(key)

    if not aggregated:
        return {
            "status": "inconclusive",
            "document_name": policy.get("filename"),
            "findings": [{
                "claim_field": "policy_document",
                "document_name": policy.get("filename"),
                "page": None,
                "section": None,
                "quote": "No policy passage directly addressed the claim fields.",
                "reason": "The available policy text did not provide enough direct evidence to support or refute the claim.",
                "status": "Inconclusive",
            }],
        }

    findings = []
    policy_number = _clean(claim_fields.get("policy_number"))
    diagnosis = _clean(claim_fields.get("diagnosis") or claim_fields.get("treatment") or claim_fields.get("service_description"))
    service_date = _parse_date(claim_fields.get("service_date") or claim_fields.get("admission_date") or claim_fields.get("invoice_date"))
    claim_amount = _amount_number(claim_fields.get("claim_amount"))

    for item in aggregated:
        quote = item["quote"] or ""
        lower_quote = quote.lower()
        document_name = item["document_name"]
        section = item["section"]
        page = item["page"]

        if policy_number and re.search(r"\bpolicy\s*(?:number|no|#)\b", quote, flags=re.IGNORECASE):
            policy_match = re.search(r"\bpolicy\s*(?:number|no|#)\s*[:#-]?\s*([A-Za-z0-9-]+)", quote, flags=re.IGNORECASE)
            if policy_match and policy_match.group(1).strip() != policy_number:
                findings.append({
                    "claim_field": "policy_number",
                    "document_name": document_name,
                    "page": page,
                    "section": section,
                    "quote": quote,
                    "reason": "The policy number on the claim does not match the policy document reference.",
                    "status": "Verified",
                })
                continue

        if re.search(r"waiting period|waiting\s+period|not covered until|coverage begins after|coverage starts after", lower_quote):
            if service_date or diagnosis:
                findings.append({
                    "claim_field": "service_date" if service_date else "diagnosis",
                    "document_name": document_name,
                    "page": page,
                    "section": section,
                    "quote": quote,
                    "reason": "The policy document describes a waiting period that can affect claim timing or coverage eligibility.",
                    "status": "Verified",
                })
                continue

        if claim_amount is not None and re.search(r"limit|maximum|cap|up to|sublimit|coverage limit|annual maximum", lower_quote):
            match = re.search(
                r"(?:annual maximum|maximum|limit|cap|sublimit|coverage limit|up to)[^\n\r]{0,80}(?:\$\s*)?(\d[\d,]*\.?\d{0,2})",
                quote,
                flags=re.IGNORECASE,
            )
            if not match:
                match = re.search(r"(\d[\d,]*\.?\d{0,2})", quote, flags=re.IGNORECASE)
            if match:
                limit_value = float(match.group(1).replace(",", ""))
                if claim_amount > limit_value:
                    findings.append({
                        "claim_field": "claim_amount",
                        "document_name": document_name,
                        "page": page,
                        "section": section,
                        "quote": quote,
                        "reason": "The claim amount exceeds the policy limit or sublimit described in the policy excerpt.",
                        "status": "Verified",
                    })
                    continue

        if re.search(r"excluded|not covered|not payable|does not cover|limit|maximum|cap|sublimit|requires.*document|required document|itemized bill", lower_quote):
            findings.append({
                "claim_field": "coverage",
                "document_name": document_name,
                "page": page,
                "section": section,
                "quote": quote,
                "reason": "The policy excerpt directly references a coverage limitation, exclusion, or required document relevant to this claim.",
                "status": "Uncertain" if "required document" in lower_quote or "itemized bill" in lower_quote else "Verified",
            })
            continue

    if not findings:
        return {
            "status": "inconclusive",
            "document_name": policy.get("filename"),
            "findings": [{
                "claim_field": "coverage",
                "document_name": policy.get("filename"),
                "page": None,
                "section": None,
                "quote": aggregated[0]["quote"],
                "reason": "The policy text did not include enough direct evidence to resolve the claim issue.",
                "status": "Inconclusive",
            }],
        }

    return {
        "status": "verified" if any(f["status"] == "Verified" for f in findings) else "uncertain",
        "document_name": policy.get("filename"),
        "findings": findings,
    }


__all__ = ["verify_claim_against_policy", "_build_retrieval_questions"]
