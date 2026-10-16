import React, { useEffect, useState } from "react";
import {
  IconChartBar,
  IconGauge,
  IconTarget,
  IconShieldCheck,
} from "@tabler/icons-react";
import { getStats } from "../api";
import type { StatsResponse } from "../api/types";
import { Loading } from "../components/Loading";
import { ErrorState } from "../components/ErrorState";
import { BarChart } from "../components/charts/BarChart";

export const Analytics: React.FC = () => {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getStats();
      setStats(res);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load analytics statistics"
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
        <Loading message="Loading comprehensive portfolio analytics..." />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="py-12">
        <ErrorState
          title="Analytics Error"
          message={error || "Failed to load portfolio breakdowns."}
          onRetry={loadData}
        />
      </div>
    );
  }

  const { test } = stats;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Portfolio Risk Breakdowns &amp; Model Evaluation
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Multi-dimensional fraud rate distributions across clinical providers, patient demographics, and held-out model accuracy.
        </p>
      </div>

      {/* Held-Out Test Evaluation Card */}
      <div className="card p-6">
        <div className="flex items-center gap-2 border-b border-border pb-3 mb-5">
          <IconGauge size={20} className="text-accent" />
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              Held-Out Test Set Model Performance (20% Stratified Split)
            </h3>
            <p className="text-xs text-text-secondary">
              Evaluated exclusively on {test.n.toLocaleString()} claims unseen during machine learning training.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg bg-bg-card-alt border border-border">
            <span className="text-[11px] font-medium uppercase text-text-muted">
              Precision
            </span>
            <div className="text-2xl font-bold text-accent mt-1">
              {(test.precision * 100).toFixed(1)}%
            </div>
            <span className="text-[11px] text-text-secondary mt-0.5 block">
              Flagged claims that were actual fraud
            </span>
          </div>

          <div className="p-4 rounded-lg bg-bg-card-alt border border-border">
            <span className="text-[11px] font-medium uppercase text-text-muted">
              Recall
            </span>
            <div className="text-2xl font-bold text-accent mt-1">
              {(test.recall * 100).toFixed(1)}%
            </div>
            <span className="text-[11px] text-text-secondary mt-0.5 block">
              Total fraudulent claims intercepted
            </span>
          </div>

          <div className="p-4 rounded-lg bg-bg-card-alt border border-border">
            <span className="text-[11px] font-medium uppercase text-text-muted">
              Model Flagged
            </span>
            <div className="text-2xl font-bold text-text-primary mt-1">
              {test.flagged.toLocaleString()}
            </div>
            <span className="text-[11px] text-text-secondary mt-0.5 block">
              Claims above {(stats.threshold * 100).toFixed(0)}% threshold
            </span>
          </div>

          <div className="p-4 rounded-lg bg-bg-card-alt border border-border">
            <span className="text-[11px] font-medium uppercase text-text-muted">
              Decision Threshold
            </span>
            <div className="text-2xl font-bold text-text-primary mt-1">
              {(stats.threshold * 100).toFixed(0)}%
            </div>
            <span className="text-[11px] text-text-secondary mt-0.5 block">
              Configurable sensitivity cutoff
            </span>
          </div>
        </div>
      </div>

      {/* Grid of 9 Categorical & Binned Breakdowns */}
      <div className="space-y-6">
        <div className="border-b border-border pb-2">
          <h2 className="text-lg font-bold text-text-primary">
            Clinical &amp; Facility Dimension Breakdowns
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <BarChart
            title="Fraud Rate by Provider Type"
            subtitle="Hospital, Clinic, and specialized care center proportions"
            data={stats.by_provider_type}
            xKey="label"
            yKey="rate"
            height={280}
          />

          <BarChart
            title="Fraud Rate by Medical Specialty"
            subtitle="Clinical department and specialty risk rankings"
            data={stats.by_specialty}
            xKey="label"
            yKey="rate"
            height={280}
          />

          <BarChart
            title="Fraud Rate by Service Type"
            subtitle="Inpatient, Outpatient, and Emergency service classifications"
            data={stats.by_service_type}
            xKey="label"
            yKey="rate"
            height={280}
          />

          <BarChart
            title="Fraud Rate by Admission Type"
            subtitle="Emergency, Elective, Urgent, and Routine patient admissions"
            data={stats.by_admission_type}
            xKey="label"
            yKey="rate"
            height={280}
          />
        </div>

        <div className="border-b border-border pb-2 pt-4">
          <h2 className="text-lg font-bold text-text-primary">
            Demographic, Geographic &amp; Financial Breakdowns
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <BarChart
            title="Fraud Rate by Quarterly Cohort"
            subtitle="Temporal cohort trends across full claims history"
            data={stats.by_quarter}
            xKey="label"
            yKey="rate"
            height={280}
          />

          <BarChart
            title="Fraud Rate by Patient Age Bracket"
            subtitle="Age distribution across five standard demographic bands"
            data={stats.by_age}
            xKey="label"
            yKey="rate"
            height={280}
          />

          <BarChart
            title="Fraud Rate by Provider-Patient Distance"
            subtitle="Distance bands in miles between patient residence and facility"
            data={stats.by_distance}
            xKey="label"
            yKey="rate"
            height={280}
          />

          <BarChart
            title="Fraud Rate by Claim Amount Bracket"
            subtitle="Financial billing tier distributions from sub-500k to 2M+"
            data={stats.by_amount}
            xKey="label"
            yKey="rate"
            height={280}
          />

          <div className="lg:col-span-2">
            <BarChart
              title="Fraud Rate by Number of Procedures"
              subtitle="Correlation between clinical procedure intensity and fraud incidence"
              data={stats.by_procedures}
              xKey="label"
              yKey="rate"
              height={280}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
