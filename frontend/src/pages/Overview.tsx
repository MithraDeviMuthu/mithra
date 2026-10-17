
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  IconFileText,
  IconAlertTriangle,
  IconCurrencyDollar,
  IconShieldExclamation,
  IconArrowRight,
  IconChartBar,
  IconSearch,
  IconFileCheck,
} from "@tabler/icons-react";
import { getStats } from "../api";
import type { StatsResponse } from "../api/types";
import { Loading } from "../components/Loading";
import { ErrorState } from "../components/ErrorState";

export const Overview: React.FC = () => {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await getStats();
      setStats(response);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load system overview metrics"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
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

  const averageAmount = kpis.avg_claim_amount.toLocaleString(
    undefined,
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  );

  const portfolioPercentage =
    kpis.claims > 0
      ? ((kpis.flagged_by_model / kpis.claims) * 100).toFixed(1)
      : "0.0";

  return (
    <div className="space-y-8 overview-page">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-2">
            SECURESCORE / DASHBOARD
          </p>

          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            System Overview
          </h1>

          <p className="mt-2 text-sm text-text-secondary">
            Intelligent verification and insurance portfolio monitoring.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-bg-card px-4 py-3">
          <p className="text-xs text-text-muted">Observation Window</p>
          <p className="mt-1 text-sm font-medium text-text-secondary">
            {stats.date_range[0]} — {stats.date_range[1]}
          </p>
        </div>
      </header>

      <section>
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-text-primary">
            Portfolio Metrics
          </h2>
          <p className="mt-1 text-xs text-text-secondary">
            Key figures from the available claims data.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <div className="glow-card">
            <div className="glow-card-content">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">
                  Total Claims
                </span>
                <IconFileText size={21} className="text-accent" />
              </div>
              <p className="mt-5 text-3xl font-bold text-text-primary">
                {kpis.claims.toLocaleString()}
              </p>
              <p className="mt-2 text-xs text-text-muted">
                {kpis.fraud_claims.toLocaleString()} confirmed fraud records
              </p>
            </div>
          </div>

          <div className="glow-card">
            <div className="glow-card-content">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">
                  Fraud Rate
                </span>
                <IconAlertTriangle size={21} className="text-accent" />
              </div>
              <p className="mt-5 text-3xl font-bold text-text-primary">
                {(kpis.fraud_rate * 100).toFixed(2)}%
              </p>
              <p className="mt-2 text-xs text-text-muted">
                Historical baseline rate
              </p>
            </div>
          </div>

          <div className="glow-card">
            <div className="glow-card-content">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">
                  Average Claim
                </span>
                <IconCurrencyDollar size={21} className="text-accent" />
              </div>
              <p className="mt-5 text-3xl font-bold text-text-primary">
                ${averageAmount}
              </p>
              <p className="mt-2 text-xs text-text-muted">
                Average submitted claim amount
              </p>
            </div>
          </div>

          <div className="glow-card">
            <div className="glow-card-content">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">
                  Model Flagged
                </span>
                <IconShieldExclamation size={21} className="text-accent" />
              </div>
              <p className="mt-5 text-3xl font-bold text-text-primary">
                {kpis.flagged_by_model.toLocaleString()}
              </p>
              <p className="mt-2 text-xs text-text-muted">
                {portfolioPercentage}% of claims in this portfolio
              </p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-text-primary">
            Quick Access
          </h2>
          <p className="mt-1 text-xs text-text-secondary">
            Select a section to continue your work.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <Link to="/verify" className="glow-card glow-card-link group">
            <div className="glow-card-content flex h-full flex-col">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-accent">
                  Verification
                </span>
                <IconFileCheck size={22} className="text-accent" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-text-primary">
                Verify a Claim
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-text-secondary">
                Evaluate an individual claim using the existing verification
                and scoring workflow.
              </p>
              <span className="mt-5 flex items-center gap-2 text-sm font-medium text-accent">
                Open verification
                <IconArrowRight
                  size={16}
                  className="transition-transform group-hover:translate-x-1"
                />
              </span>
            </div>
          </Link>

          <Link to="/insights" className="glow-card glow-card-link group">
            <div className="glow-card-content flex h-full flex-col">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-accent">
                  Analytics
                </span>
                <IconChartBar size={22} className="text-accent" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-text-primary">
                Loss Ratio & Insights
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-text-secondary">
                Explore the existing portfolio insights and performance
                information.
              </p>
              <span className="mt-5 flex items-center gap-2 text-sm font-medium text-accent">
                View insights
                <IconArrowRight
                  size={16}
                  className="transition-transform group-hover:translate-x-1"
                />
              </span>
            </div>
          </Link>

          <Link to="/person-claim" className="glow-card glow-card-link group">
            <div className="glow-card-content flex h-full flex-col">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-accent">
                  Explorer
                </span>
                <IconSearch size={22} className="text-accent" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-text-primary">
                Person & Claim Explorer
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-text-secondary">
                Open the person and individual claim search workspace.
              </p>
              <span className="mt-5 flex items-center gap-2 text-sm font-medium text-accent">
                Explore records
                <IconArrowRight
                  size={16}
                  className="transition-transform group-hover:translate-x-1"
                />
              </span>
            </div>
          </Link>
        </div>
      </section>
    </div>
  );
};
