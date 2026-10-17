import React, { useEffect, useState } from "react";
import {
  IconCpu,
  IconSend,
  IconArrowUpRight,
  IconArrowDownRight,
  IconChartBar,
  IconAlertCircle,
  IconCheck,
  IconFileText,
} from "@tabler/icons-react";
import {
  getFields,
  getFieldsStatus,
  getOptions,
  predictClaim,
  predictStatus,
} from "../api";
import type {
  FieldsResponse,
  FieldsStatusResponse,
  OptionsResponse,
  PredictResult,
  PredictStatusResult,
} from "../api/types";
import { StatusBadge } from "./StatusBadge";
import { Loading } from "./Loading";
import { ErrorState } from "./ErrorState";

export interface ClaimScoreFormProps {
  initialValues?: Record<string, string | number>;
  initialOptionalLabels?: {
    claimId?: string;
    patientId?: string;
    policyNumber?: string;
    providerName?: string;
  };
  mode?: "fraud" | "status" | "both";
  allowModeSwitch?: boolean;
  showClaimSummary?: boolean;
  onScored?: (
    fraudResult: PredictResult | null,
    statusResult: PredictStatusResult | null
  ) => void;
  formTitle?: string;
  formSubtitle?: string;
}

export const ClaimScoreForm: React.FC<ClaimScoreFormProps> = ({
  initialValues,
  initialOptionalLabels,
  mode: initialMode = "both",
  allowModeSwitch = false,
  showClaimSummary = false,
  onScored,
  formTitle,
  formSubtitle,
}) => {
  const [activeMode, setActiveMode] = useState<"fraud" | "status" | "both">(
    initialMode
  );
  const [fieldsInfo, setFieldsInfo] = useState<FieldsResponse | null>(null);
  const [statusFieldsInfo, setStatusFieldsInfo] =
    useState<FieldsStatusResponse | null>(null);
  const [options, setOptions] = useState<OptionsResponse | null>(null);

  const [formData, setFormData] = useState<Record<string, string | number>>(
    initialValues || {}
  );
  const [optionalClaimId, setOptionalClaimId] = useState<string>(
    initialOptionalLabels?.claimId || ""
  );
  const [optionalPatientId, setOptionalPatientId] = useState<string>(
    initialOptionalLabels?.patientId || ""
  );
  const [optionalPolicyNumber, setOptionalPolicyNumber] = useState<string>(
    initialOptionalLabels?.policyNumber || ""
  );

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);

  const [fraudResult, setFraudResult] = useState<PredictResult | null>(null);
  const [statusResult, setStatusResult] = useState<PredictStatusResult | null>(
    null
  );
  const [modelThreshold, setModelThreshold] = useState<number>(0.3);

  useEffect(() => {
    if (initialValues) {
      setFormData((prev) => ({ ...prev, ...initialValues }));
    }
  }, [initialValues]);

  useEffect(() => {
    if (initialOptionalLabels) {
      if (initialOptionalLabels.claimId) setOptionalClaimId(initialOptionalLabels.claimId);
      if (initialOptionalLabels.patientId) setOptionalPatientId(initialOptionalLabels.patientId);
      if (initialOptionalLabels.policyNumber) setOptionalPolicyNumber(initialOptionalLabels.policyNumber);
    }
  }, [initialOptionalLabels]);

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
    let nextFraudResult: PredictResult | null = null;
    let nextStatusResult: PredictStatusResult | null = null;

    try {
      const runFraud = activeMode === "fraud" || activeMode === "both";
      const runStatus = activeMode === "status" || activeMode === "both";

      if (runFraud) {
        const res = await predictClaim(formData, true);
        setModelThreshold(res.threshold);
        if (res.results && res.results.length > 0 && res.results[0]) {
          nextFraudResult = res.results[0];
          setFraudResult(nextFraudResult);
        }
      } else {
        setFraudResult(null);
      }

      if (runStatus) {
        const statusPayload = { ...formData };
        if (nextFraudResult) {
          statusPayload.Is_Fraudulent = nextFraudResult.is_fraud ? 1 : 0;
        }
        const sRes = await predictStatus(statusPayload);
        if (sRes.results && sRes.results.length > 0 && sRes.results[0]) {
          nextStatusResult = sRes.results[0];
          setStatusResult(nextStatusResult);
        }
      } else {
        setStatusResult(null);
      }

      if (onScored) {
        onScored(nextFraudResult, nextStatusResult);
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

  // Build the list of fields to render
  const combinedFields = Array.from(
    new Set([
      ...fieldsInfo.fields,
      ...(statusFieldsInfo ? statusFieldsInfo.fields : []),
    ])
  ).filter((f) => f !== "Is_Fraudulent" && f !== "Claim_ID" && f !== "Patient_ID" && f !== "Policy_Number");

  const activeFields =
    activeMode === "status" && statusFieldsInfo
      ? statusFieldsInfo.fields.filter((f) => f !== "Is_Fraudulent" && f !== "Claim_ID" && f !== "Patient_ID" && f !== "Policy_Number")
      : activeMode === "fraud"
      ? fieldsInfo.fields
      : combinedFields;

  const categoricalFields = new Set([
    ...fieldsInfo.categorical,
    ...(statusFieldsInfo ? statusFieldsInfo.categorical : []),
  ]);

  const summaryText =
    showClaimSummary && (fraudResult || statusResult)
      ? (() => {
          const patientDesc = optionalPatientId
            ? `Patient #${optionalPatientId}`
            : formData.Patient_Age
            ? `A ${formData.Patient_Age}-year-old ${formData.Patient_Gender || "patient"} in ${formData.Patient_City || "the coverage area"}`
            : "An individual patient";

          const amountVal = formData.Claim_Amount
            ? `$${Number(String(formData.Claim_Amount).replace(/[^0-9.]/g, "")).toLocaleString()}`
            : "an unrecorded amount";

          const s1 = `${patientDesc} filed a medical claim totaling ${amountVal} for ${formData.Service_Type || "clinical"} care.`;

          const fraudProb = fraudResult
            ? `${(fraudResult.fraud_probability * 100).toFixed(1)}%`
            : "N/A";
          const riskLevel = fraudResult?.risk_level || "Unknown";
          const predictedStatus = statusResult?.predicted_status || "Pending Review";
          const s2 = `The automated fraud engine scored this filing at a ${fraudProb} risk probability (${riskLevel} risk level), and the multi-class adjudicator predicted a claim status of "${predictedStatus}".`;

          const topFactors = fraudResult?.explanation?.factors?.slice(0, 2) || [];
          let s3 = "";
          const f1 = topFactors[0];
          const f2 = topFactors[1];
          if (f1 && f2) {
            s3 = `Key SHAP risk factors were ${f1.feature.replace(/_/g, " ")} (${f1.direction === "increases" ? "elevating" : "reducing"} risk by ${(Math.abs(f1.impact) * 100).toFixed(1)}%) and ${f2.feature.replace(/_/g, " ")} (${f2.direction === "increases" ? "elevating" : "reducing"} risk by ${(Math.abs(f2.impact) * 100).toFixed(1)}%).`;
          } else if (f1) {
            s3 = `The top risk factor was ${f1.feature.replace(/_/g, " ")} (${f1.direction === "increases" ? "elevating" : "reducing"} risk by ${(Math.abs(f1.impact) * 100).toFixed(1)}%).`;
          } else {
            s3 = `All submitted clinical parameters reflect standard adjudication guidelines.`;
          }

          return `${s1} ${s2} ${s3}`;
        })()
      : null;

  return (
    <div className="space-y-6">
      {allowModeSwitch && (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center p-1 bg-bg-card-alt rounded-lg border border-border">
            <button
              type="button"
              onClick={() => {
                setActiveMode("fraud");
                setStatusResult(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeMode === "fraud"
                  ? "bg-accent/20 text-accent font-semibold"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              Fraud Risk Model
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveMode("status");
                setFraudResult(null);
              }}
              disabled={!statusFieldsInfo}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeMode === "status"
                  ? "bg-accent/20 text-accent font-semibold"
                  : "text-text-muted hover:text-text-primary disabled:opacity-40"
              }`}
            >
              Status Classifier
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveMode("both");
              }}
              disabled={!statusFieldsInfo}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeMode === "both"
                  ? "bg-accent/20 text-accent font-semibold"
                  : "text-text-muted hover:text-text-primary disabled:opacity-40"
              }`}
            >
              Dual Evaluation
            </button>
          </div>
        </div>
      )}

      {/* Main Grid: Form Left (7 cols), Results Right (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Form Panel */}
        <div className="lg:col-span-7 card p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">
                  {formTitle || `Claim Features (${activeFields.length} input features)`}
                </h3>
                {formSubtitle && (
                  <p className="text-xs text-text-muted mt-0.5">{formSubtitle}</p>
                )}
              </div>
              <span className="text-xs text-text-muted">
                {activeMode === "fraud"
                  ? "Random Forest Fraud Pipeline"
                  : activeMode === "status"
                  ? "Multi-class Status Pipeline"
                  : "Fraud + Status Pipelines"}
              </span>
            </div>

            {/* Optional Identifier Labels */}
            <div className="p-3 rounded-lg bg-bg-card-alt/60 border border-border/70 space-y-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted block">
                Filing Identifiers (Optional Labels)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-text-secondary truncate">
                    Claim ID
                  </label>
                  <input
                    type="text"
                    value={optionalClaimId}
                    onChange={(e) => setOptionalClaimId(e.target.value)}
                    placeholder="e.g. 101"
                    className="w-full px-2.5 py-1.5 text-xs rounded-md bg-bg-card border border-border text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-text-secondary truncate">
                    Patient ID
                  </label>
                  <input
                    type="text"
                    value={optionalPatientId}
                    onChange={(e) => setOptionalPatientId(e.target.value)}
                    placeholder="e.g. P1002"
                    className="w-full px-2.5 py-1.5 text-xs rounded-md bg-bg-card border border-border text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-text-secondary truncate">
                    Policy Number
                  </label>
                  <input
                    type="text"
                    value={optionalPolicyNumber}
                    onChange={(e) => setOptionalPolicyNumber(e.target.value)}
                    placeholder="e.g. POL-8821"
                    className="w-full px-2.5 py-1.5 text-xs rounded-md bg-bg-card border border-border text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Dynamic Model Input Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[520px] overflow-y-auto pr-2">
              {activeFields.map((field) => {
                const isCat = categoricalFields.has(field);
                const fieldOptions =
                  options && field in options
                    ? options[field as keyof OptionsResponse]
                    : null;
                const value =
                  formData[field] !== undefined ? String(formData[field]) : "";

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
                        onChange={(e) =>
                          handleFieldChange(field, e.target.value)
                        }
                        className="w-full px-3 py-2 text-xs rounded-lg bg-bg-card-alt border border-border text-text-primary focus:border-accent focus:outline-none"
                      >
                        <option value="">
                          -- Select {field.replace(/_/g, " ")} --
                        </option>
                        {fieldOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={`field-${field}`}
                        type={
                          field.toLowerCase().includes("date") ? "date" : "text"
                        }
                        value={value}
                        onChange={(e) =>
                          handleFieldChange(field, e.target.value)
                        }
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
                  setOptionalClaimId("");
                  setOptionalPatientId("");
                  setOptionalPolicyNumber("");
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

          {/* Client-Side Claim Summary Card (Step 11) */}
          {summaryText && (
            <div className="card p-5 space-y-2 border-accent/40 bg-accent/5">
              <div className="flex items-center gap-2 text-accent">
                <IconFileText size={18} />
                <h4 className="text-xs font-bold uppercase tracking-wider">
                  Claim Summary
                </h4>
              </div>
              <p className="text-xs text-text-primary leading-relaxed">
                {summaryText}
              </p>
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
                  <span className="text-xs text-text-muted">
                    Estimated Fraud Probability
                  </span>
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
                      Base rate:{" "}
                      {(fraudResult.explanation.base_value * 100).toFixed(1)}%
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
                              Value:{" "}
                              {factor.value !== null
                                ? String(factor.value)
                                : "N/A"}
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
                  {Object.entries(statusResult.probabilities).map(
                    ([cls, prob]) => (
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
                    )
                  )}
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
                Fill in the claim parameters on the left and click &ldquo;Evaluate
                Claim&rdquo; to calculate real-time fraud probability and status.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
