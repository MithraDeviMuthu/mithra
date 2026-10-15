import unittest

from api.duplicate_detection import DEFAULT_EXACT_THRESHOLD, DEFAULT_NEAR_THRESHOLD, find_duplicate_claims


class DuplicateDetectionTests(unittest.TestCase):
    def setUp(self):
        self.rows = [
            {
                "Claim_ID": "CLM-1001",
                "Policy_Number": "POL-0099",
                "Claim_Amount": 1825.00,
                "Claim_Date": "2024-01-15",
                "Service_Date": "2024-01-10",
                "Provider_Type": "Hospital",
                "Provider_Specialty": "Cardiology",
                "Hospital_ID": "H-42",
                "Diagnosis_Code": "I10",
            },
            {
                "Claim_ID": "CLM-2200",
                "Policy_Number": "POL-1100",
                "Claim_Amount": 6450.00,
                "Claim_Date": "2024-03-20",
                "Service_Date": "2024-03-18",
                "Provider_Type": "Specialist Office",
                "Provider_Specialty": "Neurology",
                "Hospital_ID": "H-88",
                "Diagnosis_Code": "J02.9",
            },
        ]

    def test_exact_duplicate_is_flagged(self):
        result = find_duplicate_claims({
            "claim_id": "CLM-1001",
            "policy_number": "POL-0099",
            "claim_amount": "$1,825.00",
            "service_date": "2024-01-10",
            "provider_name": "North Valley Hospital",
        }, self.rows)
        self.assertEqual(result["status"], "review_candidates")
        self.assertTrue(any(item["match_type"] == "exact" for item in result["candidates"]))
        self.assertIn("policy_number", " ".join(reason["field"] for reason in result["candidates"][0]["reasons"]))

    def test_near_duplicate_uses_configurable_threshold(self):
        claim = {
            "policy_number": "POL-1199",
            "claim_amount": "$6,450.00",
            "service_date": "2024-03-17",
            "provider_name": "Neurology Specialists of the Valley",
        }
        result = find_duplicate_claims(claim, self.rows, exact_threshold=DEFAULT_EXACT_THRESHOLD, near_threshold=DEFAULT_NEAR_THRESHOLD)
        self.assertEqual(result["status"], "review_candidates")
        self.assertTrue(any(item["match_type"] == "near" for item in result["candidates"]))

        strict_result = find_duplicate_claims(claim, self.rows, exact_threshold=0.99, near_threshold=0.95)
        self.assertEqual(strict_result["status"], "clear")

    def test_non_duplicate_not_flagged(self):
        result = find_duplicate_claims({
            "policy_number": "POL-4040",
            "claim_amount": "$150.00",
            "service_date": "2024-08-01",
            "provider_name": "Does Not Exist Clinic",
        }, self.rows)
        self.assertEqual(result["status"], "clear")
        self.assertEqual(result["count"], 0)

    def test_threshold_change_affects_result(self):
        claim = {
            "policy_number": "POL-0099",
            "claim_amount": "$1,780.00",
            "service_date": "2024-01-12",
            "provider_name": "North Valley Hospital",
        }
        result = find_duplicate_claims(claim, self.rows, exact_threshold=0.99, near_threshold=0.85)
        self.assertEqual(result["status"], "review_candidates")
        self.assertGreaterEqual(result["candidates"][0]["score"], 0.85)


if __name__ == "__main__":
    unittest.main()
