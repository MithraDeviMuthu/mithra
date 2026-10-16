import React, { useEffect, useState } from "react";
import {
  IconCpu,
  IconDice,
  IconSend,
  IconArrowUpRight,
  IconArrowDownRight,
  IconChartBar,
  IconAlertCircle,
  IconCheck,
  IconSearch,
} from "@tabler/icons-react";
import {
  getFields,
  getFieldsStatus,
  getOptions,
  getSampleClaim,
  predictClaim,
  predictStatus,
  searchClaim,
} from "../api";
import type {
  FieldsResponse,
  FieldsStatusResponse,
  OptionsResponse,
  PredictResult,
  PredictStatusResult,
} from "../api/types";
import { StatusBadge } from "../components/StatusBadge";
import { Loading } from "../components/Loading";
import { ErrorState } from "../components/ErrorState";

export const Verify: React.FC = () => {
  const [mode, setMode] = useState<"fraud" | "status">("fraud");
  const [fieldsInfo, setFieldsInfo] = useState<FieldsResponse | null>(null);
  const [statusFieldsInfo, setStatusFieldsInfo] = useState<FieldsStatusResponse | null>(null);
  const [options, setOptions] = useState<OptionsResponse | null>(null);

  // Claim Lookup state
  const [lookupClaimId, setLookupClaimId] = useState<string>("");
  const [lookingUp, setLookingUp] = useState<boolean>(false);
  const [lookupMessage, setLookupMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  const [formData, setFormData] = useState<Record<string, string | number>>({});
  const [sampleMeta, setSampleMeta] = useState<{
    claim_id?: string | number;
    labelled_fraud?: boolean;
  } | null>(null);

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);

  const [fraudResult, setFraudResult] = useState<PredictResult | null>(null);
  const [statusResult, setStatusResult] = useState<PredictStatusResult | null>(null);
  const [modelThreshold, setModelThreshold] = useState<number>(0.3);

  const loadConfig = async () => {
    setLoadingConfig(true);
    setConfigError(null);
    try {
      const [fRes, oRes] = await Promise.all([getFields(), getOptions()]);
      setFieldsInfo(fRes);
      setOptions(oRes);

      try {
        const sRes = await getFieldsStatus();
        setStatusFieldsInfo(sRes);
      } catch {
        // Status model optional
      }
    } catch (err) {
      setConfigError(
        err instanceof Error ? err.message : "Failed to load model field schema"
      );
    } finally {
      setLoadingConfig(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleLookupClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = lookupClaimId.trim();
    if (!id) return;

    setLookingUp(true);
    setLookupMessage(null);
    try {
      const res = await searchClaim(id);
      if (!res.claim) {
        setLookupMessage({ text: `No claim found with ID #${id}`, isError: true });
      } else {
        const stringifiedValues: Record<string, string | number> = {};
        Object.entries(res.claim).forEach(([key, val]) => {
          if (val !== null && val !== undefined) {
            stringifiedValues[key] = val as string | number;
          }
        });
        setFormData(stringifiedValues);
        setSampleMeta({
          claim_id: res.claim_id,
          labelled_fraud: Boolean(res.claim.Is_Fraudulent),
        });
        setLookupMessage({ text: `Claim #${id} successfully loaded into form.` });
        setFraudResult(null);
        setStatusResult(null);
      }
    } catch (err) {
      setLookupMessage({
        text: err instanceof Error ? err.message : "Claim lookup query failed",
        isError: true,
      });
    } finally {
      setLookingUp(false);
    }
  };

  const handleFillSample = async () => {
    setScoreError(null);
    setLookupMessage(null);
    try {
      const sample = await getSampleClaim();
      const stringifiedValues: Record<string, string | number> = {};
      Object.entries(sample.claim).forEach(([key, val]) => {
        if (val !== null && val !== undefined) {
          stringifiedValues[key] = val as string | number;
        }
      });
      setFormData(stringifiedValues);
      setSampleMeta({
        claim_id: sample.claim_id,
        labelled_fraud: sample.labelled_fraud,
      });
      setFraudResult(null);
      setStatusResult(null);
    } catch (err) {
      setScoreError(
        err instanceof Error ? err.message : "Failed to load a sample claim"
      );
    }
  };

  const handleFieldChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setScoring(true);
    setScoreError(null);
    try {
      if (mode === "fraud") {
        const res = await predictClaim(formData, true);
        setModelThreshold(res.threshold);
        if (res.results && res.results.length > 0 && res.results[0]) {
          setFraudResult(res.results[0]);
        }
      } else {
        const res = await predictStatus(formData);
        if (res.results && res.results.length > 0 && res.results[0]) {
          setStatusResult(res.results[0]);
        }
      }
    } catch (err) {
      setScoreError(
        err instanceof Error ? err.message : "Scoring calculation failed"
      );
    } finally {
      setScoring(false);
    }
  };

  if (loadingConfig) {
    return (
      <div className="py-12">
        <Loading message="Loading model schema and field parameters..." />
      </div>
    );
  }

  if (configError || !fieldsInfo) {
    return (
      <div className="py-12">
        <ErrorState
          title="Configuration Error"
          message={configError || "Unable to retrieve model field definitions."}
          onRetry={loadConfig}
        />
      </div>
    );
  }

  const activeFields =
    mode === "status" && statusFieldsInfo
      ? statusFieldsInfo.fields
      : fieldsInfo.fields;

  const categoricalFields = new Set(
    mode === "status" && statusFieldsInfo
      ? statusFieldsInfo.categorical
      : fieldsInfo.categorical
  );

  return (
    <div className="space-y-8">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Verify &amp; Score Claim Records
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Look up historical filings or submit custom parameters for automated Random Forest fraud risk scoring and SHAP explainability.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Mode Switcher */}
          <div className="flex items-center p-1 bg-bg-card-alt rounded-lg border border-border">
            <button
              type="button"
              onClick={() => {
                setMode("fraud");
                setFraudResult(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mode === "fraud"
                  ? "bg-accent/20 text-accent font-semibold"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              Fraud Risk Model
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("status");
                setStatusResult(null);
              }}
              disabled={!statusFieldsInfo}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mode === "status"
                  ? "bg-accent/20 text-accent font-semibold"
                  : "text-text-muted hover:text-text-primary disabled:opacity-40"
              }`}
            >
              Status Classifier
            </button>
          </div>

          {/* Fill Sample Button */}
          <button
            type="button"
            onClick={handleFillSample}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg bg-bg-card border border-border text-text-primary hover:bg-bg-card-alt transition-colors"
          >
            <IconDice size={16} className="text-accent" />
            Fill Sample Claim
          </button>
        </div>
      </div>

      {/* Claim Lookup Card (Uses /api/claim-search to auto-fill) */}
      <div className="card p-5">
        <form onSubmit={handleLookupClaim} className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted">
              <IconSearch size={15} />
            </div>
            <input
              type="text"
              value={lookupClaimId}
              onChange={(e) => setLookupClaimId(e.target.value)}
              placeholder="Look up an existing claim by ID to auto-populate form (e.g. 1, 2, 101)..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-bg-card-alt border border-border text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={lookingUp || !lookupClaimId.trim()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-bg-card border border-border text-text-primary hover:bg-bg-card-alt transition-colors disabled:opacity-50"
          >
            <IconSearch size={14} />
            {lookingUp ? "Loading..." : "Load Claim Into Form"}
          </button>
        </form>

        {lookupMessage && (
          <p
            className={`text-xs mt-2.5 font-medium ${
              lookupMessage.isError ? "text-danger-text" : "text-success-text"
            }`}
          >
            {lookupMessage.text}
          </p>
        )}
      </div>

      {/* Sample Meta Banner if loaded */}
      {sampleMeta && (
        <div className="flex items-center justify-between p-3.5 rounded-lg bg-bg-card-alt border border-border">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-text-primary">
              Loaded Claim #{sampleMeta.claim_id}:
            </span>
            <span className="text-text-secondary">
              Record parameters mapped into form.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Historical Record Flag:</span>
            <StatusBadge
              status={sampleMeta.labelled_fraud ? "High" : "Low"}
              label={sampleMeta.labelled_fraud ? "Confirmed Fraud" : "Legitimate"}
            />
          </div>
        </div>
      )}

      {/* Main Grid: Form Left (7 cols), Results Right (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Form Panel */}
        <div className="lg:col-span-7 card p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-semibold text-text-primary">
                Claim Features ({activeFields.length} input features)
              </h3>
              <span className="text-xs text-text-muted">
                {mode === "fraud" ? "Random Forest Pipeline" : "Multi-class Status Pipeline"}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[550px] overflow-y-auto pr-2">
              {activeFields.map((field) => {
                const isCat = categoricalFields.has(field);
                const fieldOptions =
                  options && field in options
                    ? options[field as keyof OptionsResponse]
                    : null;
                const value = formData[field] !== undefined ? String(formData[field]) : "";

                return (
                  <div key={field} className="space-y-1.5">
                    <label
                      htmlFor={`field-${field}`}
                      className="block text-xs font-medium text-text-secondary truncate"
                      title={field}
                    >
                      {field.replace(/_/g, " ")}
                    </label>

                    {isCat && fieldOptions && fieldOptions.length > 0 ? (
                      <select
                        id={`field-${field}`}
                        value={value}
                        onChange={(e) => handleFieldChange(field, e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg bg-bg-card-alt border border-border text-text-primary focus:border-accent focus:outline-none"
                      >
                        <option value="">-- Select {field.replace(/_/g, " ")} --</option>
                        {fieldOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={`field-${field}`}
                        type={field.toLowerCase().includes("date") ? "date" : "text"}
                        value={value}
                        onChange={(e) => handleFieldChange(field, e.target.value)}
                        placeholder={`Enter ${field.replace(/_/g, " ")}`}
                        className="w-full px-3 py-2 text-xs rounded-lg bg-bg-card-alt border border-border text-text-primary focus:border-accent focus:outline-none"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-border flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setFormData({});
                  setFraudResult(null);
                  setStatusResult(null);
                  setSampleMeta(null);
                }}
                className="px-4 py-2 text-xs font-medium rounded-lg text-text-muted hover:text-text-primary transition-colors"
              >
                Clear Fields
              </button>

              <button
                type="submit"
                disabled={scoring || Object.keys(formData).length === 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-lg bg-accent text-bg-page hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                {scoring ? (
                  <>
                    <IconCpu className="animate-spin" size={16} />
                    Scoring Claim...
                  </>
                ) : (
                  <>
                    <IconSend size={16} />
                    Evaluate Claim
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Prediction Results Panel */}
        <div className="lg:col-span-5 space-y-6">
          {scoreError && (
            <div className="card p-4 border-danger/40 bg-danger-bg/50 text-danger-text text-xs flex items-start gap-2.5">
              <IconAlertCircle size={18} className="shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">Evaluation Error</span>
                {scoreError}
              </div>
            </div>
          )}

          {/* Fraud Result */}
          {fraudResult && (
            <div className="card p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <span className="text-xs uppercase tracking-wider text-text-muted font-medium">
                    Risk Assessment Result
                  </span>
                  <h3 className="text-lg font-bold text-text-primary mt-0.5">
                    Fraud Risk: {fraudResult.risk_level}
                  </h3>
                </div>
                <StatusBadge status={fraudResult.risk_level} />
              </div>

              {/* Gauge / Score Box */}
              <div className="p-4 rounded-lg bg-bg-card-alt border border-border flex items-center justify-between">
                <div>
                  <span className="text-xs text-text-muted">Estimated Fraud Probability</span>
                  <div className="text-3xl font-extrabold text-accent mt-1">
                    {(fraudResult.fraud_probability * 100).toFixed(1)}%
                  </div>
                  <span className="text-[11px] text-text-secondary mt-1 block">
                    Decision Threshold: {(modelThreshold * 100).toFixed(0)}%
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-xs text-text-muted">Decision Flag</span>
                  <div className="mt-1">
                    {fraudResult.is_fraud ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-danger-text">
                        <IconAlertCircle size={15} /> Flagged for Investigation
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-success-text">
                        <IconCheck size={15} /> Passed Automated Check
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* SHAP Feature Explanations */}
              {fraudResult.explanation && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                      <IconChartBar size={16} className="text-accent" />
                      SHAP Feature Attributions
                    </span>
                    <span className="text-[11px] text-text-muted">
                      Base rate: {(fraudResult.explanation.base_value * 100).toFixed(1)}%
                    </span>
                  </div>

                  <p className="text-[11px] text-text-secondary">
                    Factors driving this claim&apos;s probability above or below the baseline:
                  </p>

                  <div className="space-y-2 pt-1">
                    {fraudResult.explanation.factors.map((factor, idx) => {
                      const isUp = factor.direction === "increases";
                      const impactPct = (factor.impact * 100).toFixed(2);
                      return (
                        <div
                          key={idx}
                          className="p-2.5 rounded-lg bg-bg-card-alt border border-border flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="font-medium text-text-primary">
                              {factor.feature.replace(/_/g, " ")}
                            </div>
                            <div className="text-[11px] text-text-muted truncate max-w-[200px]">
                              Value: {factor.value !== null ? String(factor.value) : "N/A"}
                            </div>
                          </div>

                          <div
                            className={`flex items-center gap-1 font-semibold text-xs ${
                              isUp ? "text-danger-text" : "text-success-text"
                            }`}
                          >
                            {isUp ? (
                              <IconArrowUpRight size={15} />
                            ) : (
                              <IconArrowDownRight size={15} />
                            )}
                            {isUp ? `+${impactPct}%` : `${impactPct}%`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Status Result */}
          {statusResult && (
            <div className="card p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <span className="text-xs uppercase tracking-wider text-text-muted font-medium">
                    Predicted Claim Status
                  </span>
                  <h3 className="text-lg font-bold text-text-primary mt-0.5">
                    {statusResult.predicted_status}
                  </h3>
                </div>
                <StatusBadge status={statusResult.predicted_status} />
              </div>

              {/* Class Probability Distribution */}
              <div className="space-y-3">
                <span className="text-xs font-semibold text-text-primary block">
                  Class Probabilities
                </span>
                <div className="space-y-2.5">
                  {Object.entries(statusResult.probabilities).map(([cls, prob]) => (
                    <div key={cls} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-text-secondary">{cls}</span>
                        <span className="font-semibold text-text-primary">
                          {(prob * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-bg-card-alt overflow-hidden">
                        <div
                          className="h-full bg-accent rounded-full"
                          style={{ width: `${Math.max(prob * 100, 2)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!fraudResult && !statusResult && !scoring && (
            <div className="card p-8 text-center text-text-muted flex flex-col items-center justify-center min-h-[300px]">
              <IconCpu size={36} className="text-text-muted/60 mb-3" />
              <p className="text-sm font-medium text-text-secondary">
                Awaiting Claim Verification
              </p>
              <p className="text-xs text-text-muted mt-1 max-w-xs">
                Look up a claim ID above, click &ldquo;Fill Sample Claim&rdquo;, or configure parameters to evaluate risk.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
