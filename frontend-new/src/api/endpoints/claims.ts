import { apiClient } from "../client";
import type {
  ClaimDocumentDetailResponse,
  ClaimDocumentUploadResponse,
  ClaimDocumentsResponse,
  ReviewClaimsResponse,
} from "../types";

export async function listClaimDocuments(): Promise<ClaimDocumentsResponse> {
  return apiClient.get<ClaimDocumentsResponse>("/api/claim-documents");
}

export async function uploadClaimDocument(
  file: File
): Promise<ClaimDocumentUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  return apiClient.upload<ClaimDocumentUploadResponse>(
    "/api/claim-documents",
    formData
  );
}

export async function getClaimDocument(
  documentId: string
): Promise<ClaimDocumentDetailResponse> {
  return apiClient.get<ClaimDocumentDetailResponse>(
    `/api/claim-documents/${documentId}`
  );
}

export async function reviewClaimDocument(
  documentId: string,
  correctedFields: Record<string, unknown>
): Promise<ClaimDocumentDetailResponse> {
  return apiClient.post<ClaimDocumentDetailResponse>(
    `/api/claim-documents/${documentId}/review`,
    correctedFields
  );
}

export async function deleteClaimDocument(
  documentId: string
): Promise<{ deleted: boolean; document_id: string }> {
  return apiClient.delete<{ deleted: boolean; document_id: string }>(
    `/api/claim-documents/${documentId}`
  );
}

export async function getReviewClaims(
  limit = 200
): Promise<ReviewClaimsResponse> {
  return apiClient.get<ReviewClaimsResponse>("/api/review-claims", { limit });
}
