import React, { useState } from "react";
import {
  IconCopy,
  IconChartInfographic,
  IconDice,
  IconSearch,
  IconAlertTriangle,
  IconCheck,
  IconAdjustments,
  IconFilter,
} from "@tabler/icons-react";
import {
  detectDuplicates,
  detectAnomalies,
  getReviewClaims,
  getSampleClaim,
} from "../api";
import type {
  DuplicateClaimsResponse,
  AnomalyDetectionResponse,
} from "../api/types";
import { StatusBadge } from "../components/StatusBadge";
import { Loading } from "../components/Loading";
import { ErrorState } from "../components/ErrorState";

export const Patterns: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"duplicates" | "anomalies">("duplicates");

  // --- DUPLICATES STATE ---
  const [claimFields, setClaimFields] = useState({
    Policy_Number: "POL-99214",
    Claim_ID: "CLM-4482",
    Claim_Amount: "45000",
    Claim_Date: "2024-03-15",
    Service_Date: "2024-03-10",
    Provider_Type: "Hospital",
    Hospital_ID: "102",
    Diagnosis_Code: "J18.9",
  });

  const [comparisonsText, setComparisonsText] = useState<string>(
    JSON.stringify(
      [
        {
          Claim_ID: "CLM-4482",
          Policy_Number: "POL-99214",
          Claim_Amount: 45000,
          Claim_Date: "2024-03-15",
          Service_Date: "2024-03-10",
          Provider_Type: "Hospital",
          Hospital_ID: "102",
          Diagnosis_Code: "J18.9",
        },
        {
          Claim_ID: "CLM-4490",
          Policy_Number: "POL-99214",
          Claim_Amount: 44500,
          Claim_Date: "2024-03-16",
          Service_Date: "2024-03-10",
          Provider_Type: "Hospital",
          Hospital_ID: "102",
          Diagnosis_Code: "J18.9",
        },
        {
          Claim_ID: "CLM-8812",
          Policy_Number: "POL-11002",
          Claim_Amount: 1200,
          Claim_Date: "2024-01-20",
          Service_Date: "2024-01-18",
          Provider_Type: "Clinic",
          Hospital_ID: "405",
          Diagnosis_Code: "K21.9",
        },
      ],
      null,
      2
    )
  );

  const [exactThreshold, setExactThreshold] = useState<number>(0.96);
  const [nearThreshold, setNearThreshold] = useState<number>(0.82);
  const [evaluatingDupes, setEvaluatingDupes] = useState<boolean>(false);
  const [dupeResult, setDupeResult] = useState<DuplicateClaimsResponse | null>(null);
  const [dupeError, setDupeError] = useState<string | null>(null);

  // --- ANOMALIES STATE ---
  const [groupByCols, setGroupByCols] = useState<string[]>(["Provider_Type", "Service_Type"]);
  const [minGroupSize, setMinGroupSize] = useState<number>(5);
  const [claimsJson, setClaimsJson] = useState<string>(
    JSON.stringify(
      [
        {
          Claim_ID: 101,
          Claim_Amount: 1450000,
          Provider_Type: "Hospital",
          Service_Type: "Inpatient",
          Admission_Type: "Emergency",
        },
        {
          Claim_ID: 102,
          Claim_Amount: 22000,
          Provider_Type: "Hospital",
          Service_Type: "Inpatient",
          Admission_Type: "Emergency",
        },
        {
          Claim_ID: 103,
          Claim_Amount: 28000,
          Provider_Type: "Hospital",
          Service_Type: "Inpatient",
          Admission_Type: "Emergency",
        },
        {
          Claim_ID: 104,
          Claim_Amount: 31000,
          Provider_Type: "Hospital",
          Service_Type: "Inpatient",
          Admission_Type: "Emergency",
        },
        {
          Claim_ID: 105,
          Claim_Amount: 19500,
          Provider_Type: "Hospital",
          Service_Type: "Inpatient",
          Admission_Type: "Emergency",
        },
        {
          Claim_ID: 201,
          Claim_Amount: 850000,
          Provider_Type: "Clinic",
          Service_Type: "Outpatient",
          Admission_Type: "Elective",
        },
        {
          Claim_ID: 202,
          Claim_Amount: 1500,
          Provider_Type: "Clinic",
          Service_Type: "Outpatient",
          Admission_Type: "Elective",
        },
        {
          Claim_ID: 203,
          Claim_Amount: 1800,
          Provider_Type: "Clinic",
          Service_Type: "Outpatient",
          Admission_Type: "Elective",
        },
      ],
      null,
      2
    )
  );

  const [analyzingAnoms, setAnalyzingAnoms] = useState<boolean>(false);
  const [anomResult, setAnomResult] = useState<AnomalyDetectionResponse | null>(null);
  const [anomError, setAnomError] = useState<string | null>(null);

  // Load sample for duplicates
  const handleLoadSampleDupes = async () => {
    try {
      const [sampleRes, queueRes] = await Promise.all([
        getSampleClaim(),
        getReviewClaims(10),
      ]);
      const sc = sampleRes.claim;
      setClaimFields({
        Policy_Number: String(sc.Policy_Number || "POL-88319"),
        Claim_ID: String(sampleRes.claim_id || "CLM-901"),
        Claim_Amount: String(sc.Claim_Amount || "15000"),
        Claim_Date: String(sc.Claim_Date || "2024-02-01"),
        Service_Date: String(sc.Service_Date || "2024-01-28"),
        Provider_Type: String(sc.Provider_Type || "Hospital"),
        Hospital_ID: String(sc.Hospital_ID || "12"),
        Diagnosis_Code: String(sc.Diagnosis_Code || "A09"),
      });

      const simulatedComparisons = [
        {
          Claim_ID: String(sampleRes.claim_id || "CLM-901"),
          Policy_Number: String(sc.Policy_Number || "POL-88319"),
          Claim_Amount: Number(sc.Claim_Amount || 15000) * 0.98,
          Claim_Date: String(sc.Claim_Date || "2024-02-02"),
          Service_Date: String(sc.Service_Date || "2024-01-28"),
          Provider_Type: String(sc.Provider_Type || "Hospital"),
          Hospital_ID: String(sc.Hospital_ID || "12"),
          Diagnosis_Code: String(sc.Diagnosis_Code || "A09"),
        },
        ...queueRes.claims.map((c) => ({
          Claim_ID: String(c.claim_id),
          Policy_Number: String(c.policy_number),
          Claim_Amount: c.claim_amount,
          Claim_Date: c.claim_date,
          Service_Date: c.service_date,
          Provider_Type: c.provider_type,
          Hospital_ID: c.hospital_id,
          Diagnosis_Code: c.diagnosis_code,
        })),
      ];
      setComparisonsText(JSON.stringify(simulatedComparisons, null, 2));
      setDupeResult(null);
      setDupeError(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to load sample data");
    }
  };

  const handleEvaluateDupes = async (e: React.FormEvent) => {
    e.preventDefault();
    setEvaluatingDupes(true);
    setDupeError(null);

    let parsedComparisons: Record<string, unknown>[];
    try {
      parsedComparisons = JSON.parse(comparisonsText);
      if (!Array.isArray(parsedComparisons)) {
        throw new Error("Comparisons dataset must be an array of claim objects.");
      }
    } catch (err) {
      setDupeError(`Invalid JSON: ${err instanceof Error ? err.message : "Parsing error"}`);
      setEvaluatingDupes(false);
      return;
    }

    try {
      const res = await detectDuplicates({
        claim: claimFields,
        comparisons: parsedComparisons,
        exact_threshold: exactThreshold,
        near_threshold: nearThreshold,
      });
      setDupeResult(res);
    } catch (err) {
      setDupeError(err instanceof Error ? err.message : "Duplicate check failed");
    } finally {
      setEvaluatingDupes(false);
    }
  };

  // Load sample for anomalies
  const handleLoadSampleAnoms = async () => {
    try {
      const res = await getReviewClaims(40);
      const mapped = res.claims.map((c) => ({
        Claim_ID: c.claim_id,
        Claim_Amount: c.claim_amount,
        Provider_Type: c.provider_type,
        Service_Type: c.service_type,
        Hospital_ID: c.hospital_id,
      }));
      mapped.push({
        Claim_ID: "FLAGGED-OUTLIER-999",
        Claim_Amount: 4850000,
        Provider_Type: "Clinic",
        Service_Type: "Outpatient",
        Hospital_ID: 102,
      });
      setClaimsJson(JSON.stringify(mapped, null, 2));
      setAnomResult(null);
      setAnomError(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to load database claims");
    }
  };

  const toggleGroupColumn = (col: string) => {
    setGroupByCols((prev) =>
      prev.includes(col)
        ? prev.length > 1
          ? prev.filter((c) => c !== col)
          : prev
        : [...prev, col]
    );
  };

  const handleRunAnomalies = async (e: React.FormEvent) => {
    e.preventDefault();
    setAnalyzingAnoms(true);
    setAnomError(null);

    let parsedClaims: Record<string, unknown>[];
    try {
      parsedClaims = JSON.parse(claimsJson);
      if (!Array.isArray(parsedClaims)) {
        throw new Error("Claims data must be an array of objects.");
      }
    } catch (err) {
      setAnomError(`Invalid JSON: ${err instanceof Error ? err.message : "Parsing error"}`);
      setAnalyzingAnoms(false);
      return;
    }

    try {
      const res = await detectAnomalies({
        claims: parsedClaims,
        group_by: groupByCols,
        min_group_size: minGroupSize,
      });
      setAnomResult(res);
    } catch (err) {
      setAnomError(err instanceof Error ? err.message : "Anomaly detection failed");
    } finally {
      setAnalyzingAnoms(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header & Sub-Nav Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Fraud Patterns &amp; Outlier Detection
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Identify suspicious multi-claim duplicate billings, cross-provider filing overlap, and statistical IQR charge anomalies.
          </p>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="flex items-center p-1 bg-bg-card-alt rounded-lg border border-border">
          <button
            onClick={() => setActiveTab("duplicates")}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === "duplicates"
                ? "bg-accent/20 text-accent font-semibold"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            <IconCopy size={15} />
            Duplicate Claims Detection
          </button>
          <button
            onClick={() => setActiveTab("anomalies")}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === "anomalies"
                ? "bg-accent/20 text-accent font-semibold"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            <IconChartInfographic size={15} />
            Billing Outlier Anomalies
          </button>
        </div>
      </div>

      {/* TAB 1: DUPLICATE CLAIMS DETECTION */}
      {activeTab === "duplicates" && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleLoadSampleDupes}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-bg-card border border-border text-text-primary hover:bg-bg-card-alt transition-colors"
            >
              <IconDice size={16} className="text-accent" />
              Load Live Dataset Sample
            </button>
          </div>

          {dupeError && (
            <div className="card p-4 border-danger/40 bg-danger-bg/50 text-danger-text text-xs flex items-center gap-2">
              <IconAlertTriangle size={18} />
              <span>{dupeError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Form */}
            <div className="lg:col-span-6 card p-6 space-y-6">
              <form onSubmit={handleEvaluateDupes} className="space-y-5">
                <div className="border-b border-border pb-3">
                  <h3 className="text-sm font-semibold text-text-primary">
                    Subject Claim for Verification
                  </h3>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    Target claim to match against historical filings.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(claimFields).map(([key, val]) => (
                    <div key={key} className="space-y-1">
                      <label className="block text-[11px] font-medium text-text-secondary uppercase">
                        {key.replace(/_/g, " ")}
                      </label>
                      <input
                        type="text"
                        value={val}
                        onChange={(e) =>
                          setClaimFields((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-1.5 text-xs rounded-md bg-bg-card-alt border border-border text-text-primary focus:border-accent focus:outline-none"
                      />
                    </div>
                  ))}
                </div>

                {/* Threshold Sliders */}
                <div className="p-4 rounded-lg bg-bg-card-alt border border-border space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                    <IconAdjustments size={16} className="text-accent" />
                    Detection Sensitivity Cutoffs
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-text-muted">Exact Match:</span>
                        <span className="font-semibold text-text-primary">
                          {(exactThreshold * 100).toFixed(0)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.80"
                        max="1.0"
                        step="0.01"
                        value={exactThreshold}
                        onChange={(e) => setExactThreshold(parseFloat(e.target.value))}
                        className="w-full accent-accent"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-text-muted">Near Match:</span>
                        <span className="font-semibold text-text-primary">
                          {(nearThreshold * 100).toFixed(0)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.60"
                        max="0.95"
                        step="0.01"
                        value={nearThreshold}
                        onChange={(e) => setNearThreshold(parseFloat(e.target.value))}
                        className="w-full accent-accent"
                      />
                    </div>
                  </div>
                </div>

                {/* Comparison JSON */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary block">
                    Comparison Claims Array (JSON)
                  </label>
                  <textarea
                    rows={6}
                    value={comparisonsText}
                    onChange={(e) => setComparisonsText(e.target.value)}
                    className="w-full p-3 font-mono text-[11px] rounded-lg bg-bg-card-alt border border-border text-text-primary focus:border-accent focus:outline-none"
                  />
                </div>

                <div className="flex justify-end pt-2 border-t border-border">
                  <button
                    type="submit"
                    disabled={evaluatingDupes}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-lg bg-accent text-bg-page hover:bg-accent/90 transition-colors disabled:opacity-50"
                  >
                    <IconSearch size={16} />
                    {evaluatingDupes ? "Evaluating Claims..." : "Execute Duplicate Check"}
                  </button>
                </div>
              </form>
            </div>

            {/* Results */}
            <div className="lg:col-span-6 space-y-6">
              {evaluatingDupes ? (
                <Loading message="Evaluating similarity scores across comparison claims..." className="min-h-[300px]" />
              ) : dupeResult ? (
                <div className="card p-6 space-y-6">
                  <div className="flex items-center justify-between border-b border-border pb-4">
                    <div>
                      <span className="text-xs uppercase tracking-wider text-text-muted font-medium">
                        Duplicate Analysis Outcome
                      </span>
                      <h3 className="text-lg font-bold text-text-primary mt-0.5">
                        {dupeResult.status === "review_candidates"
                          ? `${dupeResult.count} Duplicate Candidate(s) Detected`
                          : "Clear — No Duplicate Claims Found"}
                      </h3>
                    </div>
                    <StatusBadge status={dupeResult.status} />
                  </div>

                  {dupeResult.candidates.length === 0 ? (
                    <div className="p-8 text-center text-text-muted">
                      <IconCheck size={36} className="mx-auto text-success-text mb-2" />
                      <p className="text-sm font-semibold text-text-primary">
                        Zero Duplicate Flags
                      </p>
                      <p className="text-xs text-text-muted mt-1">
                        No comparison claim crossed the near-duplicate threshold of {(dupeResult.thresholds.near * 100).toFixed(0)}%.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {dupeResult.candidates.map((cand, idx) => (
                        <div
                          key={idx}
                          className="p-4 rounded-lg bg-bg-card-alt border border-border space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <StatusBadge status={cand.match_type} label={`${cand.match_type.toUpperCase()} MATCH`} />
                              <span className="text-sm font-bold text-accent">
                                {(cand.score * 100).toFixed(1)}% Similarity
                              </span>
                            </div>
                            <span className="text-xs font-mono text-text-muted">
                              #{String(cand.reference_record.Claim_ID || "N/A")}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-1">
                            <div>
                              <span className="text-[10px] text-text-muted uppercase block">Policy #</span>
                              <span className="text-text-primary font-medium">
                                {String(cand.reference_record.Policy_Number || "N/A")}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-text-muted uppercase block">Amount</span>
                              <span className="text-text-primary font-medium">
                                ${Number(cand.reference_record.Claim_Amount || 0).toLocaleString()}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-text-muted uppercase block">Service Date</span>
                              <span className="text-text-primary font-medium">
                                {String(cand.reference_record.Service_Date || "N/A")}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-text-muted uppercase block">Provider</span>
                              <span className="text-text-primary font-medium">
                                {String(cand.reference_record.Provider_Type || "N/A")}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-text-muted uppercase block">Hospital ID</span>
                              <span className="text-text-primary font-medium">
                                {String(cand.reference_record.Hospital_ID || "N/A")}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-text-muted uppercase block">Diagnosis</span>
                              <span className="text-accent font-mono">
                                {String(cand.reference_record.Diagnosis_Code || "N/A")}
                              </span>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-border/60 space-y-1.5">
                            <span className="text-[10px] uppercase font-semibold text-text-muted block">
                              Match Attribution Reasons:
                            </span>
                            <div className="space-y-1">
                              {cand.reasons.map((r, rIdx) => (
                                <div
                                  key={rIdx}
                                  className="text-[11px] p-1.5 rounded bg-bg-card border border-border/80 flex items-center justify-between"
                                >
                                  <span className="text-text-secondary">{r.details}</span>
                                  <span className="font-semibold text-accent ml-2">
                                    {(r.similarity * 100).toFixed(0)}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="card p-12 text-center text-text-muted flex flex-col items-center justify-center min-h-[350px]">
                  <IconCopy size={36} className="text-text-muted/40 mb-3" />
                  <p className="text-sm font-medium text-text-secondary">
                    Awaiting Duplicate Evaluation
                  </p>
                  <p className="text-xs text-text-muted mt-1 max-w-xs">
                    Configure parameters and click &ldquo;Execute Duplicate Check&rdquo; to identify overlapping billings.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: BILLING OUTLIER ANOMALIES */}
      {activeTab === "anomalies" && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleLoadSampleAnoms}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-bg-card border border-border text-text-primary hover:bg-bg-card-alt transition-colors"
            >
              <IconDice size={16} className="text-accent" />
              Load Live Dataset Batch
            </button>
          </div>

          {anomError && (
            <div className="card p-4 border-danger/40 bg-danger-bg/50 text-danger-text text-xs flex items-center gap-2">
              <IconAlertTriangle size={18} />
              <span>{anomError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Form */}
            <div className="lg:col-span-5 card p-6 space-y-6">
              <form onSubmit={handleRunAnomalies} className="space-y-5">
                <div className="border-b border-border pb-3">
                  <h3 className="text-sm font-semibold text-text-primary">
                    Grouping &amp; Baseline Parameters
                  </h3>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    Cluster claims by relevant provider or service dimensions.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-text-secondary flex items-center gap-1.5">
                    <IconFilter size={15} className="text-accent" />
                    Cluster Groups By:
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {["Provider_Type", "Service_Type", "Admission_Type", "Hospital_ID"].map((col) => {
                      const active = groupByCols.includes(col);
                      return (
                        <button
                          type="button"
                          key={col}
                          onClick={() => toggleGroupColumn(col)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                            active
                              ? "bg-accent/20 text-accent border-accent/40 font-semibold"
                              : "bg-bg-card-alt text-text-secondary border-border hover:text-text-primary"
                          }`}
                        >
                          {col.replace(/_/g, " ")}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-medium text-text-secondary">
                      Minimum Group Size:
                    </label>
                    <span className="font-semibold text-text-primary">
                      {minGroupSize} claims
                    </span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={minGroupSize}
                    onChange={(e) => setMinGroupSize(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-bg-card-alt border border-border text-text-primary focus:border-accent focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-text-secondary">
                    Claims Dataset Array (JSON)
                  </label>
                  <textarea
                    rows={10}
                    value={claimsJson}
                    onChange={(e) => setClaimsJson(e.target.value)}
                    className="w-full p-3 font-mono text-[11px] rounded-lg bg-bg-card-alt border border-border text-text-primary focus:border-accent focus:outline-none"
                  />
                </div>

                <div className="flex justify-end pt-2 border-t border-border">
                  <button
                    type="submit"
                    disabled={analyzingAnoms}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-lg bg-accent text-bg-page hover:bg-accent/90 transition-colors disabled:opacity-50"
                  >
                    <IconSearch size={16} />
                    {analyzingAnoms ? "Running IQR Analysis..." : "Detect Anomalies"}
                  </button>
                </div>
              </form>
            </div>

            {/* Results */}
            <div className="lg:col-span-7 space-y-6">
              {analyzingAnoms ? (
                <Loading message="Evaluating robust interquartile ranges and outlier thresholds..." className="min-h-[350px]" />
              ) : anomResult ? (
                <div className="card p-6 space-y-6">
                  <div className="flex items-center justify-between border-b border-border pb-4">
                    <div>
                      <span className="text-xs uppercase tracking-wider text-text-muted font-medium">
                        Statistical Outlier Outcome
                      </span>
                      <h3 className="text-lg font-bold text-text-primary mt-0.5">
                        {anomResult.status === "review_candidates"
                          ? `${anomResult.count} Billing Anomalies Flagged`
                          : "Zero Statistical Outliers Detected"}
                      </h3>
                    </div>
                    <StatusBadge status={anomResult.status} />
                  </div>

                  {anomResult.anomalies.length === 0 ? (
                    <div className="p-8 text-center text-text-muted">
                      <IconCheck size={36} className="mx-auto text-success-text mb-2" />
                      <p className="text-sm font-semibold text-text-primary">
                        Normal Distribution
                      </p>
                      <p className="text-xs text-text-muted mt-1">
                        All submitted claim amounts fall within expected statistical IQR bounds for their comparison segments.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {anomResult.anomalies.map((anom, idx) => (
                        <div
                          key={idx}
                          className="p-4 rounded-lg bg-bg-card-alt border border-border space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <StatusBadge status={anom.severity} label={`${anom.severity} Outlier`} />
                              <span className="text-sm font-bold text-danger-text">
                                ${anom.claim_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <span className="text-xs font-mono text-text-muted">
                              #{String(anom.claim_id)}
                            </span>
                          </div>

                          <div className="text-xs text-text-secondary">
                            <span className="text-text-muted">Peer Group:</span>{" "}
                            <span className="font-medium text-text-primary">{anom.group}</span>
                            {anom.fallback_to_global && (
                              <span className="ml-2 text-[10px] text-text-muted italic">
                                (Group &lt; {minGroupSize}: evaluated against global baseline)
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs p-3 rounded bg-bg-card border border-border/70">
                            <div>
                              <span className="text-[10px] text-text-muted uppercase block">Group Median</span>
                              <span className="text-text-primary font-medium">
                                ${anom.comparison.median.toLocaleString()}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-text-muted uppercase block">IQR Spread</span>
                              <span className="text-text-primary font-medium">
                                ${anom.comparison.iqr.toLocaleString()}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-text-muted uppercase block">Upper Cutoff</span>
                              <span className="text-text-primary font-medium">
                                ${anom.comparison.upper_threshold.toLocaleString()}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-text-muted uppercase block">Over Limit</span>
                              <span className="text-danger-text font-bold">
                                +${anom.comparison.amount_vs_threshold.toLocaleString()}
                              </span>
                            </div>
                          </div>

                          <p className="text-[11px] text-text-muted leading-relaxed">
                            {anom.reason}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="card p-12 text-center text-text-muted flex flex-col items-center justify-center min-h-[350px]">
                  <IconChartInfographic size={36} className="text-text-muted/40 mb-3" />
                  <p className="text-sm font-medium text-text-secondary">
                    Awaiting Anomaly Evaluation
                  </p>
                  <p className="text-xs text-text-muted mt-1 max-w-xs">
                    Configure comparison dimensions and click &ldquo;Detect Anomalies&rdquo; to identify excessive outlier billings.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
