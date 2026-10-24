import io
import tempfile
import unittest

from docx import Document

from api.policy_verification import verify_claim_against_policy
from api.rag import RagStore


class PolicyVerificationTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = RagStore(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def _make_policy(self, text):
        doc = self.store.add_document("owner-a", "policy.txt", text.encode("utf-8"))
        return doc["id"]

    def test_policy_verification_reports_cited_finding(self):
        policy_id = self._make_policy(
            "Section 2 Coverage\nThis policy covers emergency care after 30 days of active membership. "
            "The annual maximum for outpatient services is $5,000. "
            "A completed itemized bill is required for reimbursement."
        )
        result = verify_claim_against_policy(
            "owner-a",
            policy_id,
            {
                "claim_number": "CLM-1001",
                "policy_number": "POL-900",
                "claim_amount": "$6,000",
                "service_date": "2024-02-15",
                "diagnosis": "outpatient physical therapy",
            },
            self.store,
        )
        self.assertEqual(result["status"], "verified")
        self.assertTrue(any(item["claim_field"] == "claim_amount" for item in result["findings"]))
        self.assertTrue(any("$5,000" in item["quote"] or "annual maximum" in item["quote"].lower() for item in result["findings"]))

    def test_policy_verification_inconclusive_when_evidence_insufficient(self):
        policy_id = self._make_policy("Section 1 General Terms\nThe contract remains in force and is governed by the policy terms.")
        result = verify_claim_against_policy(
            "owner-a",
            policy_id,
            {"claim_number": "CLM-2048", "service_date": "2024-06-01", "claim_amount": "$350"},
            self.store,
        )
        self.assertEqual(result["status"], "inconclusive")
        self.assertEqual(result["findings"][0]["status"], "Inconclusive")

    def test_policy_number_mismatch_is_reported(self):
        policy_id = self._make_policy("Policy Number: POL-777\nCoverage includes emergency visits.")
        result = verify_claim_against_policy(
            "owner-a",
            policy_id,
            {"policy_number": "POL-999", "service_date": "2024-08-11", "claim_amount": "$200"},
            self.store,
        )
        self.assertEqual(result["status"], "mismatch")
        self.assertTrue(any(item["claim_field"] == "policy_number" for item in result["findings"]))

    def test_waiting_period_date_is_detected(self):
        policy_id = self._make_policy(
            "Section 4 Waiting period\nThe waiting period for maternity care is 24 months after policy start."
        )
        result = verify_claim_against_policy(
            "owner-a",
            policy_id,
            {"diagnosis": "maternity care", "service_date": "2024-02-01"},
            self.store,
        )
        self.assertTrue(any(item["claim_field"] in {"service_date", "diagnosis"} for item in result["findings"]))


if __name__ == "__main__":
    unittest.main()
