import React, { useEffect, useState } from "react";
import {
  IconChartPie,
  IconBuildingHospital,
  IconTrendingUp,
} from "@tabler/icons-react";
import { getAnalytics, getLossRatio, getProviderRisk } from "../api";
import type {
  AnalyticsResponse,
  LossRatioResponse,
  ProviderRiskResponse,
  FilterParams,
} from "../api";
import { StatusBadge } from "../components/StatusBadge";
import { Loading } from "../components/Loading";
import { ErrorState } from "../components/ErrorState";
import { LineChart } from "../components/charts/LineChart";
import { DashboardFilters } from "../components/DashboardFilters";

export const Insights: React.FC = () => {
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [lossRatio, setLossRatio] = useState<LossRatioResponse | null>(null);
  const [providerRisk, setProviderRisk] = useState<ProviderRiskResponse | null>(null);
  const [filters, setFilters] = useState<FilterParams>({});

  const [trendFilter, setTrendFilter] = useState<string>("All");
  const [providerLimit, setProviderLimit] = useState<number>(100);
  const [lossRatioSegment, setLossRatioSegment] = useState<
    "by_policy_type" | "by_income_bracket" | "by_provider_type" | "by_network"
  >("by_policy_type");

  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async (activeFilters: FilterParams = filters, timestamp?: number) => {
    setLoading(true);
    setError(null);
    try {
      const [aRes, lRes, pRes] = await Promise.all([
        getAnalytics(activeFilters, timestamp),
        getLossRatio(activeFilters, timestamp),
        getProviderRisk(
          {
            limit: providerLimit,
            ...(trendFilter === "All" ? {} : { trend: trendFilter }),
            ...activeFilters,
          },
          timestamp
        ),
      ]);
      setAnalytics(aRes);
      setLossRatio(lRes);
      setProviderRisk(pRes);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load actuarial insights"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(filters);

    const handleClaimSaved = () => {
      // Force fresh cache-busted fetch
      void loadData(filters, Date.now());
    };
    window.addEventListener("claimSaved", handleClaimSaved);
    return () => {
      window.removeEventListener("claimSaved", handleClaimSaved);
    };
  }, [filters, providerLimit, trendFilter]);

  const handleTrendFilterChange = async (trend: string) => {
    setTrendFilter(trend);
    try {
      const pRes = await getProviderRisk(
        {
          trend: trend === "All" ? undefined : trend,
          limit: providerLimit,
          ...filters,
        },
        Date.now()
      );
      setProviderRisk(pRes);
    } catch (err) {
      console.error("Failed to filter provider risk:", err);
    }
  };

  const handleShowMore = async () => {
    if (providerLimit >= 500) return;
    const nextLimit = Math.min(providerLimit + 100, 500);
    setProviderLimit(nextLimit);
    setLoadingMore(true);
    try {
      const pRes = await getProviderRisk(
        {
          trend: trendFilter === "All" ? undefined : trendFilter,
          limit: nextLimit,
          ...filters,
        },
        Date.now()
      );
      setProviderRisk(pRes);
    } catch (err) {
      console.error("Failed to load more providers:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12">
        <Loading message="Loading actuarial insights and loss ratio data..." />
      </div>
    );
  }

  if (error || !analytics || !lossRatio || !providerRisk) {
    return (
      <div className="py-12">
        <ErrorState
          title="Insights Data Error"
          message={error || "Failed to load complete actuarial insights."}
          onRetry={loadData}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Actuarial Insights &amp; Loss Ratio Analysis
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Longitudinal portfolio volume, underwriting premium loss ratios, and facility fraud trajectory tracking.
        </p>
      </div>

      {/* Interactive Range Filters */}
      <DashboardFilters
        initialFilters={filters}
        onFilterChange={(newFilters) => {
          setFilters(newFilters);
          void loadData(newFilters, Date.now());
        }}
      />

      {/* Monthly Claims Volume & Fraud Rate Trend Chart */}
      <LineChart
        title="Monthly Claims Volume &amp; Fraud Rate Trajectory"
        subtitle="Longitudinal progression of total claim filings compared against model-identified fraud rates"
        data={analytics.monthly}
        xKey="month"
        height={320}
        series={[
          {
            key: "claims",
            name: "Claims Volume",
            yAxisId: "left",
            formatValue: (v) => `${v.toLocaleString()} claims`,
            color: "#6E9BD6",
          },
          {
            key: "fraud_rate",
            name: "Fraud Rate",
            yAxisId: "right",
            formatValue: (v) => `${(v * 100).toFixed(2)}%`,
            color: "#C4696A",
          },
        ]}
      />

      {/* Loss Ratio Performance Section */}
      <div className="card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <IconChartPie className="text-accent" size={20} />
              <h3 className="text-base font-semibold text-text-primary">
                Loss Ratio Performance Across Underwriting Segments
              </h3>
            </div>
            <p className="text-xs text-text-secondary mt-1">
              Approved claims paid relative to earned premiums (Industry benchmark: 60% – 80%).
            </p>
          </div>

          {/* Segment Selector Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto p-1 bg-bg-card-alt rounded-lg border border-border">
            {[
              { id: "by_policy_type", label: "Policy Type" },
              { id: "by_income_bracket", label: "Income Bracket" },
              { id: "by_provider_type", label: "Provider Type" },
              { id: "by_network", label: "Network Provider" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() =>
                  setLossRatioSegment(
                    tab.id as
                      | "by_policy_type"
                      | "by_income_bracket"
                      | "by_provider_type"
                      | "by_network"
                  )
                }
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  lossRatioSegment === tab.id
                    ? "bg-accent/20 text-accent font-semibold"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Overall Loss Ratio Metric Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-4 rounded-lg bg-bg-card-alt border border-border mb-6">
          <div>
            <span className="text-[11px] font-medium uppercase text-text-muted">
              Overall Loss Ratio
            </span>
            <div className="text-xl font-bold text-accent mt-1">
              {(lossRatio.overall.loss_ratio * 100).toFixed(2)}%
            </div>
          </div>
          <div>
            <span className="text-[11px] font-medium uppercase text-text-muted">
              Premiums Collected
            </span>
            <div className="text-lg font-semibold text-text-primary mt-1">
              ${lossRatio.overall.premium_collected.toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}
            </div>
          </div>
          <div>
            <span className="text-[11px] font-medium uppercase text-text-muted">
              Approved Claims Paid
            </span>
            <div className="text-lg font-semibold text-text-primary mt-1">
              ${lossRatio.overall.claims_paid.toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}
            </div>
          </div>
          <div>
            <span className="text-[11px] font-medium uppercase text-text-muted">
              Active Underwritten Policies
            </span>
            <div className="text-lg font-semibold text-text-primary mt-1">
              {lossRatio.overall.policies.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Loss Ratio Segment Breakdown Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-bg-card-alt text-text-muted uppercase text-[10px] tracking-wider border-b border-border">
              <tr>
                <th className="py-2.5 px-3">Segment Name</th>
                <th className="py-2.5 px-3">Loss Ratio</th>
                <th className="py-2.5 px-3">Collected Premium</th>
                <th className="py-2.5 px-3">Claims Paid</th>
                <th className="py-2.5 px-3">Policy Count</th>
                <th className="py-2.5 px-3">Profitability Assessment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {lossRatio[lossRatioSegment].map((row, idx) => {
                const ratioPct = row.loss_ratio * 100;
                const isHighLoss = ratioPct > 80;
                const isOptimal = ratioPct >= 55 && ratioPct <= 80;
                return (
                  <tr key={idx} className="hover:bg-bg-card-alt/50 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-text-primary">
                      {row.label}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-accent">
                      {ratioPct.toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-3 text-text-secondary">
                      ${row.premium_collected.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </td>
                    <td className="py-2.5 px-3 text-text-secondary">
                      ${row.claims_paid.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </td>
                    <td className="py-2.5 px-3 text-text-muted">
                      {row.n.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusBadge
                        status={
                          isHighLoss
                            ? "Rising"
                            : isOptimal
                            ? "Stable"
                            : "Falling"
                        }
                        label={
                          isHighLoss
                            ? "High Loss Exposure"
                            : isOptimal
                            ? "Target Margin"
                            : "High Margin"
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Provider Risk Table */}
      <div className="card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <IconBuildingHospital className="text-accent" size={20} />
              <h3 className="text-base font-semibold text-text-primary">
                Provider Fraud-Rate Trend Tracking
              </h3>
            </div>
            <p className="text-xs text-text-secondary mt-1">
              Identifies healthcare facilities whose fraudulent claim incidence is climbing over observed calendar years.
            </p>
          </div>

          {/* Trend Filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-text-muted mr-1">Filter Trajectory:</span>
            {[
              { id: "All", label: "All", count: providerRisk.total_providers },
              { id: "Rising", label: "Rising", count: providerRisk.trend_counts?.Rising ?? 0 },
              { id: "Stable", label: "Stable", count: providerRisk.trend_counts?.Stable ?? 0 },
              { id: "Falling", label: "Falling", count: providerRisk.trend_counts?.Falling ?? 0 },
              {
                id: "Not enough history",
                label: "Not enough history",
                count: providerRisk.trend_counts?.["Not enough history"] ?? 0,
              },
            ].map((trend) => (
              <button
                key={trend.id}
                onClick={() => handleTrendFilterChange(trend.id)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors border flex items-center gap-1.5 ${
                  trendFilter === trend.id
                    ? "bg-accent/20 text-accent border-accent/40 font-semibold"
                    : "bg-bg-card-alt text-text-secondary border-border hover:text-text-primary"
                }`}
              >
                <span>{trend.label}</span>
                <span className="text-[10px] opacity-75 font-mono">({trend.count})</span>
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-bg-card-alt text-text-muted uppercase text-[10px] tracking-wider border-b border-border">
              <tr>
                <th className="py-2.5 px-3">Hospital ID</th>
                <th className="py-2.5 px-3">Provider Type</th>
                <th className="py-2.5 px-3">Specialty</th>
                <th className="py-2.5 px-3">Claims Processed</th>
                <th className="py-2.5 px-3">Cumulative Fraud Rate</th>
                <th className="py-2.5 px-3">Latest Period Fraud Rate</th>
                <th className="py-2.5 px-3">Trend Direction</th>
                <th className="py-2.5 px-3">Total Amount Billed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {providerRisk.providers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-text-muted">
                    No providers match the selected trend filter.
                  </td>
                </tr>
              ) : (
                providerRisk.providers.map((prov) => (
                  <tr
                    key={prov.hospital_id}
                    className="hover:bg-bg-card-alt/50 transition-colors"
                  >
                    <td className="py-2.5 px-3 font-semibold text-text-primary">
                      HOSP-{prov.hospital_id}
                    </td>
                    <td className="py-2.5 px-3 text-text-secondary">
                      {prov.provider_type}
                    </td>
                    <td className="py-2.5 px-3 text-text-muted">
                      {prov.specialty}
                    </td>
                    <td className="py-2.5 px-3 text-text-primary font-medium">
                      {prov.total_claims}
                    </td>
                    <td className="py-2.5 px-3 text-text-secondary">
                      {(prov.overall_fraud_rate * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 font-medium text-accent">
                      {(prov.latest_period_fraud_rate * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusBadge status={prov.trend} />
                    </td>
                    <td className="py-2.5 px-3 text-text-secondary">
                      ${prov.total_claim_amount.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Show More Pagination */}
        {providerRisk.providers.length < providerRisk.total_providers && providerLimit < 500 && (
          <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
            <span className="text-xs text-text-muted">
              Showing {providerRisk.providers.length} of {providerRisk.total_providers} facilities
            </span>
            <button
              type="button"
              onClick={handleShowMore}
              disabled={loadingMore}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-bg-card-alt border border-border text-text-primary hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
            >
              {loadingMore ? "Loading..." : "Show more (+100)"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
