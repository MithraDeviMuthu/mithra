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
  IconDeviceFloppy,
  IconSparkles,
  IconSearch,
  IconX,
  IconArrowBackUp,
  IconRotate,
} from "@tabler/icons-react";
import {
  getFields,
  getFieldsStatus,
  getOptions,
  predictClaim,
  predictStatus,
  createClaim,
  searchClaim,
  getPersonClaims,
  matchClaims,
} from "../api";
import type {
  FieldsResponse,
  FieldsStatusResponse,
  OptionsResponse,
  PredictResult,
  PredictStatusResult,
  ClaimMutationResponse,
} from "../api/types";
import { StatusBadge } from "./StatusBadge";
import { Loading } from "./Loading";
import { ErrorState } from "./ErrorState";

export const REQUIRED_FIELDS = new Set([
  "Claim_Amount",
  "Claim_Date",
  "Service_Date",
  "Patient_Age",
  "Patient_Gender",
  "Hospital_ID",
  "Provider_Type",
  "Service_Type",
  "Diagnosis_Code",
  "Procedure_Code",
  "Admission_Type",
  "Length_of_Stay_Days",
]);

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
  showSaveButton?: boolean;
  onScored?: (
    fraudResult: PredictResult | null,
    statusResult: PredictStatusResult | null
  ) => void;
  onSaved?: (savedClaim: ClaimMutationResponse) => void;
  formTitle?: string;
  formSubtitle?: string;
}

export const ClaimScoreForm: React.FC<ClaimScoreFormProps> = ({
  initialValues,
  initialOptionalLabels,
  mode: initialMode = "both",
  allowModeSwitch = false,
  showClaimSummary = false,
  showSaveButton = true,
  onScored,
  onSaved,
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

  const [autoFillLoading, setAutoFillLoading] = useState<"claim" | "patient" | "policy" | null>(null);
  const [autoFillNotice, setAutoFillNotice] = useState<{
    type: "success" | "warning";
    message: string;
  } | null>(null);
  const [previousFormData, setPreviousFormData] = useState<Record<string, string | number> | null>(null);

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [saving, setSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveConfirmation, setSaveConfirmation] = useState<{
    claimId: string | number;
    rawId: string | number;
    message: string;
    prediction?: ClaimMutationResponse["prediction"];
  } | null>(null);

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

  const handleAutoFillClaim = async (overrideId?: string) => {
    const cid = (overrideId !== undefined ? overrideId : optionalClaimId).trim();
    if (!cid) return;
    setAutoFillLoading("claim");
    setAutoFillNotice(null);
    try {
      const res = await searchClaim(cid);
      if (res.claim) {
        setPreviousFormData({ ...formData });
        const c = res.claim;
        const next: Record<string, string | number> = { ...formData };
        for (const [k, v] of Object.entries(c)) {
          if (v !== null && v !== undefined && k !== "row_id" && k !== "Is_Fraudulent") {
            if (typeof v === "string" && v.includes("T00:00:00")) {
              next[k] = v.split("T")[0] || v;
            } else {
              next[k] = String(v);
            }
          }
        }
        setFormData(next);
        if (c.Patient_ID) setOptionalPatientId(String(c.Patient_ID));
        if (c.Policy_Number) setOptionalPolicyNumber(String(c.Policy_Number));
        setAutoFillNotice({
          type: "success",
          message: `Auto-filled all fields matching Claim #${cid}`,
        });
      } else {
        setAutoFillNotice({
          type: "warning",
          message: `No existing claim found with identifier #${cid}`,
        });
      }
    } catch (err) {
      setAutoFillNotice({
        type: "warning",
        message: err instanceof Error ? err.message : `Failed to search Claim #${cid}`,
      });
    } finally {
      setAutoFillLoading(null);
    }
  };

  const handleAutoFillPatient = async (overrideId?: string) => {
    const pid = (overrideId !== undefined ? overrideId : optionalPatientId).trim();
    if (!pid) return;
    setAutoFillLoading("patient");
    setAutoFillNotice(null);
    try {
      const res = await getPersonClaims(pid);
      if (res.claims && res.claims.length > 0 && res.claims[0]) {
        setPreviousFormData({ ...formData });
        const latest = res.claims[0];
        const next: Record<string, string | number> = { ...formData };
        const patientFields = [
          "Patient_Age",
          "Patient_Gender",
          "Patient_City",
          "Patient_State",
          "Patient_Income_Bracket",
          "Policy_Type",
          "Premium_Amount",
          "Deductible_Amount",
          "CoPay_Amount",
          "Hospital_ID",
          "Provider_Type",
          "Provider_Specialty",
        ];
        for (const k of patientFields) {
          if (latest[k] !== undefined && latest[k] !== null) {
            next[k] = String(latest[k]);
          }
        }
        if (latest.Policy_Number) {
          setOptionalPolicyNumber(String(latest.Policy_Number));
        }
        setFormData(next);
        setAutoFillNotice({
          type: "success",
          message: `Auto-filled demographics from Patient #${pid} (${res.claims.length} prior claim${res.claims.length > 1 ? "s" : ""})`,
        });
      } else {
        setAutoFillNotice({
          type: "warning",
          message: `No prior claims found for Patient #${pid}`,
        });
      }
    } catch (err) {
      setAutoFillNotice({
        type: "warning",
        message: err instanceof Error ? err.message : `Failed to search Patient #${pid}`,
      });
    } finally {
      setAutoFillLoading(null);
    }
  };

  const handleAutoFillPolicy = async (overrideNum?: string) => {
    const pol = (overrideNum !== undefined ? overrideNum : optionalPolicyNumber).trim();
    if (!pol) return;
    setAutoFillLoading("policy");
    setAutoFillNotice(null);
    try {
      const res = await matchClaims({ policy_number: pol });
      if (res.matches && res.matches.length > 0 && res.matches[0]) {
        setPreviousFormData({ ...formData });
        const match = res.matches[0];
        const next: Record<string, string | number> = { ...formData };
        const policyFields = [
          "Policy_Type",
          "Premium_Amount",
          "Deductible_Amount",
          "CoPay_Amount",
          "Network_Provider",
          "Hospital_ID",
          "Provider_Type",
          "Provider_Specialty",
        ];
        for (const k of policyFields) {
          if (match[k] !== undefined && match[k] !== null) {
            next[k] = String(match[k]);
          }
        }
        if (match.Patient_ID && !optionalPatientId) {
          setOptionalPatientId(String(match.Patient_ID));
        }
        setFormData(next);
        setAutoFillNotice({
          type: "success",
          message: `Auto-filled policy parameters matching ${pol}`,
        });
      } else {
        setAutoFillNotice({
          type: "warning",
          message: `No existing policies found matching ${pol}`,
        });
      }
    } catch (err) {
      setAutoFillNotice({
        type: "warning",
        message: err instanceof Error ? err.message : `Failed to match policy ${pol}`,
      });
    } finally {
      setAutoFillLoading(null);
    }
  };

  const handleUndoAutoFill = () => {
    if (previousFormData) {
      setFormData(previousFormData);
      setPreviousFormData(null);
      setAutoFillNotice(null);
    }
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

  const handleSaveClaim = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveConfirmation(null);

    const payload: Record<string, unknown> = {
      ...formData,
    };
    if (optionalClaimId.trim()) payload.Claim_ID = optionalClaimId.trim();
    if (optionalPatientId.trim()) payload.Patient_ID = optionalPatientId.trim();
    if (optionalPolicyNumber.trim()) payload.Policy_Number = optionalPolicyNumber.trim();

    try {
      const res = await createClaim(payload);

      const rawClaimId: string | number =
        res.claim_id !== undefined && res.claim_id !== null
          ? res.claim_id
          : typeof res.claim?.Claim_ID === "string" || typeof res.claim?.Claim_ID === "number"
          ? res.claim.Claim_ID
          : "New";
      const formattedClaimId = String(rawClaimId).startsWith("CLM-")
        ? String(rawClaimId)
        : `CLM-${rawClaimId}`;

      const confirmation = {
        claimId: formattedClaimId,
        rawId: rawClaimId,
        message: res.message || `Claim ${formattedClaimId} saved successfully.`,
        prediction: res.prediction,
      };

      setSaveConfirmation(confirmation);

      // If prediction was returned, sync it into local fraudResult and statusResult
      if (res.prediction) {
        setFraudResult({
          fraud_probability: res.prediction.fraud_probability,
          is_fraud: res.prediction.is_fraud,
          risk_level: res.prediction.risk_level,
        });
        if (res.prediction.predicted_status) {
          setStatusResult({
            predicted_status: res.prediction.predicted_status,
            probabilities: res.prediction.status_probabilities || {},
          });
        }
      }

      if (onSaved) {
        onSaved(res);
      }

      // Trigger global refetch event so Overview, Insights, Analytics dashboards update
      window.dispatchEvent(
        new CustomEvent("claimSaved", {
          detail: {
            claimId: formattedClaimId,
            response: res,
          },
        })
      );
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to persist claim to dataset"
      );
    } finally {
      setSaving(false);
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

            {/* Optional Identifier Labels with Auto-Fill */}
            <div className="p-3 rounded-lg bg-bg-card-alt/60 border border-border/70 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted block">
                  Filing Identifiers &amp; Smart Auto-Fill
                </span>
                <span className="text-[11px] text-accent flex items-center gap-1 font-medium">
                  <IconSparkles size={13} />
                  Auto-fills from existing records
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-medium text-text-secondary truncate">
                      Claim ID
                    </label>
                  </div>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={optionalClaimId}
                      onChange={(e) => setOptionalClaimId(e.target.value)}
                      onBlur={() => {
                        if (optionalClaimId.trim() && !autoFillNotice) {
                          void handleAutoFillClaim();
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleAutoFillClaim();
                        }
                      }}
                      placeholder="e.g. 101"
                      className="w-full pl-2.5 pr-8 py-1.5 text-xs rounded-md bg-bg-card border border-border text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                    />
                    <button
                      type="button"
                      title="Look up claim and auto-fill details"
                      onClick={() => void handleAutoFillClaim()}
                      disabled={autoFillLoading === "claim" || !optionalClaimId.trim()}
                      className="absolute right-1 px-1.5 py-1 text-text-muted hover:text-accent disabled:opacity-30 rounded transition-colors"
                    >
                      {autoFillLoading === "claim" ? (
                        <IconCpu size={14} className="animate-spin text-accent" />
                      ) : (
                        <IconSearch size={14} />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-medium text-text-secondary truncate">
                      Patient ID
                    </label>
                  </div>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={optionalPatientId}
                      onChange={(e) => setOptionalPatientId(e.target.value)}
                      onBlur={() => {
                        if (optionalPatientId.trim() && !autoFillNotice) {
                          void handleAutoFillPatient();
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleAutoFillPatient();
                        }
                      }}
                      placeholder="e.g. P1002"
                      className="w-full pl-2.5 pr-8 py-1.5 text-xs rounded-md bg-bg-card border border-border text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                    />
                    <button
                      type="button"
                      title="Look up patient history and auto-fill demographics"
                      onClick={() => void handleAutoFillPatient()}
                      disabled={autoFillLoading === "patient" || !optionalPatientId.trim()}
                      className="absolute right-1 px-1.5 py-1 text-text-muted hover:text-accent disabled:opacity-30 rounded transition-colors"
                    >
                      {autoFillLoading === "patient" ? (
                        <IconCpu size={14} className="animate-spin text-accent" />
                      ) : (
                        <IconSearch size={14} />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-medium text-text-secondary truncate">
                      Policy Number
                    </label>
                  </div>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={optionalPolicyNumber}
                      onChange={(e) => setOptionalPolicyNumber(e.target.value)}
                      onBlur={() => {
                        if (optionalPolicyNumber.trim() && !autoFillNotice) {
                          void handleAutoFillPolicy();
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleAutoFillPolicy();
                        }
                      }}
                      placeholder="e.g. POL-8821"
                      className="w-full pl-2.5 pr-8 py-1.5 text-xs rounded-md bg-bg-card border border-border text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                    />
                    <button
                      type="button"
                      title="Look up policy coverage and auto-fill parameters"
                      onClick={() => void handleAutoFillPolicy()}
                      disabled={autoFillLoading === "policy" || !optionalPolicyNumber.trim()}
                      className="absolute right-1 px-1.5 py-1 text-text-muted hover:text-accent disabled:opacity-30 rounded transition-colors"
                    >
                      {autoFillLoading === "policy" ? (
                        <IconCpu size={14} className="animate-spin text-accent" />
                      ) : (
                        <IconSearch size={14} />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Auto-Fill Banner / Notification */}
              {autoFillNotice && (
                <div
                  className={`p-2.5 rounded-md text-xs flex items-center justify-between gap-2 transition-all ${
                    autoFillNotice.type === "success"
                      ? "bg-accent/10 border border-accent/30 text-accent font-medium"
                      : "bg-warning/10 border border-warning/30 text-warning-text"
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    {autoFillNotice.type === "success" ? (
                      <IconSparkles size={15} className="shrink-0 text-accent" />
                    ) : (
                      <IconAlertCircle size={15} className="shrink-0 text-warning-text" />
                    )}
                    <span className="truncate">{autoFillNotice.message}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {previousFormData && (
                      <button
                        type="button"
                        onClick={handleUndoAutoFill}
                        className="inline-flex items-center gap-1 text-[11px] underline hover:opacity-80 font-medium"
                      >
                        <IconArrowBackUp size={12} />
                        Undo
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setAutoFillNotice(null)}
                      className="p-1 rounded hover:bg-bg-card text-text-muted hover:text-text-primary transition-colors"
                    >
                      <IconX size={12} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Helper Notice for Required vs Default Fields */}
            <div className="flex flex-wrap items-center justify-between text-[11px] text-text-muted px-1">
              <span>
                <strong className="text-danger-text text-xs mr-0.5">*</strong>
                Required adjudication fields
              </span>
              <span className="italic">
                Blank fields automatically populate with standard defaults on save
              </span>
            </div>

            {/* Dynamic Model Input Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[520px] overflow-y-auto pr-2">
              {activeFields.map((field) => {
                const isCat = categoricalFields.has(field);
                const isRequired = REQUIRED_FIELDS.has(field);
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
                      {isRequired && (
                        <span
                          className="text-danger-text font-bold ml-1"
                          title="Required field for complete adjudication"
                        >
                          *
                        </span>
                      )}
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
                  setSaveConfirmation(null);
                  setSaveError(null);
                  setAutoFillNotice(null);
                  setPreviousFormData(null);
                }}
                className="px-4 py-2 text-xs font-medium rounded-lg text-text-muted hover:text-text-primary transition-colors"
              >
                Clear Fields
              </button>

              <div className="flex items-center gap-3">
                {showSaveButton && (
                  <button
                    type="button"
                    onClick={handleSaveClaim}
                    disabled={saving || scoring || Object.keys(formData).length === 0}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-lg bg-bg-card-alt border border-accent/40 text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <IconCpu className="animate-spin" size={16} />
                        Saving Claim...
                      </>
                    ) : (
                      <>
                        <IconDeviceFloppy size={16} />
                        Save Claim
                      </>
                    )}
                  </button>
                )}

                <button
                  type="submit"
                  disabled={scoring || saving || Object.keys(formData).length === 0}
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
            </div>
          </form>
        </div>

        {/* Prediction Results Panel */}
        <div className="lg:col-span-5 space-y-6">
          {saveError && (
            <div className="card p-4 border-danger/40 bg-danger-bg/50 text-danger-text text-xs flex items-start gap-2.5">
              <IconAlertCircle size={18} className="shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">Save Claim Error</span>
                {saveError}
              </div>
            </div>
          )}

          {saveConfirmation && (
            <div className="card p-5 space-y-3 border-accent/40 bg-accent/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-accent">
                  <IconCheck size={18} className="shrink-0" />
                  <h4 className="text-xs font-bold uppercase tracking-wider">
                    Claim {saveConfirmation.claimId} saved
                  </h4>
                </div>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-accent/20 text-accent">
                  Persisted to Dataset
                </span>
              </div>
              <p className="text-xs text-text-primary leading-relaxed">
                {saveConfirmation.message}
              </p>
              {saveConfirmation.prediction && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/80 text-xs">
                  <span className="text-text-muted">Recorded Status:</span>
                  <StatusBadge status={saveConfirmation.prediction.predicted_status || "Approved"} />
                  <span className="text-text-muted ml-2">Fraud Risk:</span>
                  <StatusBadge status={saveConfirmation.prediction.risk_level} />
                  <span className="font-semibold text-accent">
                    {(saveConfirmation.prediction.fraud_probability * 100).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          )}

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
