import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  IconFileText,
  IconAlertTriangle,
  IconCurrencyDollar,
  IconShieldExclamation,
  IconArrowRight,
  IconTrendingUp,
} from "@tabler/icons-react";
import { getStats, getTopClaims } from "../api";
import type { StatsResponse, TopClaimsResponse } from "../api/types";
import { MetricCard } from "../components/MetricCard";
import { StatusBadge } from "../components/StatusBadge";
import { Loading } from "../components/Loading";
import { ErrorState } from "../components/ErrorState";

export const Overview: React.FC = () => {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [topClaims, setTopClaims] = useState<TopClaimsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sRes, tRes] = await Promise.all([
        getStats(),
        getTopClaims({ limit: 8, scope: "test" }),
      ]);
      setStats(sRes);
      setTopClaims(tRes);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load system overview metrics"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="py-12">
        <Loading message="Loading system overview and KPI metrics..." />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="py-12">
        <ErrorState
          title="System Overview Error"
          message={error || "Failed to retrieve portfolio statistics."}
          onRetry={loadData}
        />
      </div>
    );
  }

  const { kpis } = stats;

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            System Overview &amp; Portfolio Health
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Real-time executive summary of insurance claims, machine learning risk thresholds, and flagged exposure.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">Observation Window:</span>
          <span className="text-xs font-medium text-text-secondary px-2.5 py-1 rounded bg-bg-card border border-border">
            {stats.date_range[0]} to {stats.date_range[1]}
          </span>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Claims"
          value={kpis.claims.toLocaleString()}
          icon={IconFileText}
          context="Verified claim filings"
          delta={{
            text: `${kpis.fraud_claims.toLocaleString()} confirmed fraud`,
            type: "neutral",
          }}
        />
        <MetricCard
          label="Fraud Rate"
          value={`${(kpis.fraud_rate * 100).toFixed(2)}%`}
          icon={IconAlertTriangle}
          context="Historical baseline rate"
          delta={{
            text: `${(kpis.fraud_money_share * 100).toFixed(1)}% of total exposure`,
            type: "negative",
          }}
        />
        <MetricCard
          label="Avg Claim Amount"
          value={`$${kpis.avg_claim_amount.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          icon={IconCurrencyDollar}
          context="Across all submitted claims"
        />
        <MetricCard
          label="Flagged by Model"
          value={kpis.flagged_by_model.toLocaleString()}
          icon={IconShieldExclamation}
          context={`Threshold >= ${(stats.threshold * 100).toFixed(0)}%`}
          delta={{
            text: `${((kpis.flagged_by_model / kpis.claims) * 100).toFixed(1)}% of portfolio`,
            type: "negative",
          }}
        />
      </div>

      {/* Quick Action Navigation Banners */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          to="/verify"
          className="card p-5 hover:border-accent/50 transition-colors flex flex-col justify-between group"
        >
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-accent mb-1">
              Automated Scoring
            </div>
            <h3 className="text-base font-bold text-text-primary group-hover:text-accent transition-colors">
              Verify a Claim
            </h3>
            <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
              Score claims in real time using Random Forest models with full SHAP feature explainability.
            </p>
          </div>
          <div className="mt-4 flex items-center gap-1 text-xs font-medium text-accent">
            Launch Verify <IconArrowRight size={14} />
          </div>
        </Link>

        <Link
          to="/insights"
          className="card p-5 hover:border-accent/50 transition-colors flex flex-col justify-between group"
        >
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-accent mb-1">
              Underwriting Performance
            </div>
            <h3 className="text-base font-bold text-text-primary group-hover:text-accent transition-colors">
              Loss Ratio &amp; Insights
            </h3>
            <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
              Examine premium profitability, provider risk trajectories, and monthly claims volume trends.
            </p>
          </div>
          <div className="mt-4 flex items-center gap-1 text-xs font-medium text-accent">
            View Insights <IconArrowRight size={14} />
          </div>
        </Link>

        <Link
          to="/patterns"
          className="card p-5 hover:border-accent/50 transition-colors flex flex-col justify-between group"
        >
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-accent mb-1">
              Anomaly Intelligence
            </div>
            <h3 className="text-base font-bold text-text-primary group-hover:text-accent transition-colors">
              Patterns &amp; Duplicates
            </h3>
            <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
              Detect suspicious duplicate billings across providers and statistical IQR charge outliers.
            </p>
          </div>
          <div className="mt-4 flex items-center gap-1 text-xs font-medium text-accent">
            Inspect Patterns <IconArrowRight size={14} />
          </div>
        </Link>
      </div>

      {/* Top High-Risk Flagged Claims (held-out test sample) */}
      {topClaims && topClaims.claims.length > 0 && (
        <div className="card p-6">
          <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <IconTrendingUp className="text-danger-text" size={20} />
                <h3 className="text-base font-semibold text-text-primary">
                  Top High-Risk Model Predictions (Held-Out Test Cohort)
                </h3>
              </div>
              <p className="text-xs text-text-secondary mt-1">
                Highest-probability suspicious claims evaluated by the Random Forest classifier that were never seen during model training.
              </p>
            </div>
            <StatusBadge status="High" label="Priority Review Queue" />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-bg-card-alt text-text-muted uppercase text-[10px] tracking-wider border-b border-border">
                <tr>
                  <th className="py-2.5 px-3">Claim ID</th>
                  <th className="py-2.5 px-3">Provider &amp; Specialty</th>
                  <th className="py-2.5 px-3">Service Type</th>
                  <th className="py-2.5 px-3">Claim Amount</th>
                  <th className="py-2.5 px-3">Procedures</th>
                  <th className="py-2.5 px-3">Distance</th>
                  <th className="py-2.5 px-3">Fraud Probability</th>
                  <th className="py-2.5 px-3">Model Risk Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {topClaims.claims.map((c) => (
                  <tr key={c.claim_id} className="hover:bg-bg-card-alt/50 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-text-primary">
                      #{c.claim_id}
                    </td>
                    <td className="py-2.5 px-3 text-text-secondary">
                      {c.provider_type} ({c.specialty})
                    </td>
                    <td className="py-2.5 px-3 text-text-muted">
                      {c.service_type}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-text-primary">
                      ${c.claim_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 text-text-muted">
                      {c.procedures}
                    </td>
                    <td className="py-2.5 px-3 text-text-muted">
                      {c.distance_miles} miles
                    </td>
                    <td className="py-2.5 px-3 font-bold text-danger-text">
                      {(c.probability * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusBadge status={c.risk_level} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
