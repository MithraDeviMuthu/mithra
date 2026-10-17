import { apiClient } from "../client";
import type {
  AnomalyDetectionRequest,
  AnomalyDetectionResponse,
} from "../types";

export async function detectAnomalies(
  request: AnomalyDetectionRequest
): Promise<AnomalyDetectionResponse> {
  return apiClient.post<AnomalyDetectionResponse>(
    "/api/anomaly-detection",
    request
  );
}
