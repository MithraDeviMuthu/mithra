import { apiClient } from "../client";
import type {
  FieldsResponse,
  FieldsStatusResponse,
  OptionsResponse,
  PredictResponse,
  PredictStatusResponse,
  SampleClaimResponse,
} from "../types";

export async function getFields(): Promise<FieldsResponse> {
  return apiClient.get<FieldsResponse>("/fields");
}

export async function getFieldsStatus(): Promise<FieldsStatusResponse> {
  return apiClient.get<FieldsStatusResponse>("/fields-status");
}

export async function getOptions(): Promise<OptionsResponse> {
  return apiClient.get<OptionsResponse>("/api/options");
}

export async function getSampleClaim(): Promise<SampleClaimResponse> {
  return apiClient.get<SampleClaimResponse>("/api/sample-claim");
}

export async function predictClaim(
  claim: Record<string, unknown>,
  explain = true
): Promise<PredictResponse> {
  return apiClient.post<PredictResponse>(
    explain ? "/predict?explain=1" : "/predict",
    claim
  );
}

export async function predictBatch(
  claims: Record<string, unknown>[]
): Promise<PredictResponse> {
  return apiClient.post<PredictResponse>("/predict", { claims });
}

export async function predictStatus(
  claim: Record<string, unknown> | Record<string, unknown>[]
): Promise<PredictStatusResponse> {
  return apiClient.post<PredictStatusResponse>("/predict-status", claim);
}
