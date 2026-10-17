import { apiClient } from "../client";
import type {
  DuplicateClaimsRequest,
  DuplicateClaimsResponse,
} from "../types";

export async function detectDuplicates(
  request: DuplicateClaimsRequest
): Promise<DuplicateClaimsResponse> {
  return apiClient.post<DuplicateClaimsResponse>(
    "/api/duplicate-claims",
    request
  );
}
