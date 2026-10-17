import { apiClient } from "../client";
import type {
  ClaimSearchResponse,
  PersonClaimsResponse,
  PersonSearchResponse,
} from "../types";

export async function searchPerson(
  identifier: string
): Promise<PersonSearchResponse> {
  return apiClient.get<PersonSearchResponse>("/api/person-search", {
    identifier,
  });
}

export async function getPersonClaims(
  patientId: string
): Promise<PersonClaimsResponse> {
  return apiClient.get<PersonClaimsResponse>("/api/person-claims", {
    patient_id: patientId,
  });
}

export async function searchClaim(
  claimId: string
): Promise<ClaimSearchResponse> {
  return apiClient.get<ClaimSearchResponse>("/api/claim-search", {
    claim_id: claimId,
  });
}
