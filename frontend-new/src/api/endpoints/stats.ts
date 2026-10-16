import { apiClient } from "../client";
import type {
  AnalyticsResponse,
  LossRatioResponse,
  ProviderRiskResponse,
  StatsResponse,
  TopClaimsResponse,
} from "../types";

export async function getStats(): Promise<StatsResponse> {
  return apiClient.get<StatsResponse>("/api/stats");
}

export async function getAnalytics(): Promise<AnalyticsResponse> {
  return apiClient.get<AnalyticsResponse>("/api/analytics");
}

export async function getProviderRisk(params?: {
  trend?: string;
  limit?: number;
}): Promise<ProviderRiskResponse> {
  return apiClient.get<ProviderRiskResponse>("/api/provider-risk", params);
}

export async function getLossRatio(): Promise<LossRatioResponse> {
  return apiClient.get<LossRatioResponse>("/api/loss-ratio");
}

export async function getTopClaims(params?: {
  scope?: "test" | "all";
  limit?: number;
}): Promise<TopClaimsResponse> {
  return apiClient.get<TopClaimsResponse>("/api/top-claims", params);
}
