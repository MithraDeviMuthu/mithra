import { apiClient } from "../client";
import type {
  AnalyticsResponse,
  LossRatioResponse,
  ProviderRiskResponse,
  StatsResponse,
  TopClaimsResponse,
} from "../types";

export interface FilterParams {
  start_date?: string;
  end_date?: string;
  min_amount?: number | string;
  max_amount?: number | string;
  min_age?: number | string;
  max_age?: number | string;
  _t?: number | string;
}

export async function getStats(params?: FilterParams, _t?: number | string): Promise<StatsResponse> {
  const merged = { ...params, ...(_t !== undefined ? { _t } : {}) };
  return apiClient.get<StatsResponse>("/api/stats", merged as Record<string, string | number>);
}

export async function getAnalytics(params?: FilterParams, _t?: number | string): Promise<AnalyticsResponse> {
  const merged = { ...params, ...(_t !== undefined ? { _t } : {}) };
  return apiClient.get<AnalyticsResponse>("/api/analytics", merged as Record<string, string | number>);
}

export async function getProviderRisk(
  params?: FilterParams & {
    trend?: string;
    limit?: number;
  },
  _t?: number | string
): Promise<ProviderRiskResponse> {
  const merged = { ...params, ...(_t !== undefined ? { _t } : {}) };
  return apiClient.get<ProviderRiskResponse>(
    "/api/provider-risk",
    merged as Record<string, string | number>
  );
}

export async function getLossRatio(params?: FilterParams, _t?: number | string): Promise<LossRatioResponse> {
  const merged = { ...params, ...(_t !== undefined ? { _t } : {}) };
  return apiClient.get<LossRatioResponse>("/api/loss-ratio", merged as Record<string, string | number>);
}

export async function getTopClaims(params?: {
  scope?: "test" | "all";
  limit?: number;
}): Promise<TopClaimsResponse> {
  return apiClient.get<TopClaimsResponse>("/api/top-claims", params);
}
