import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  IconFileInvoice,
  IconCheck,
  IconAlertTriangle,
  IconEdit,
  IconTrash,
  IconUpload,
  IconCpu,
  IconArrowLeft,
  IconDatabase,
  IconX,
} from "@tabler/icons-react";
import {
  listClaimDocuments,
  getClaimDocument,
  reviewClaimDocument,
  deleteClaimDocument,
  matchClaims,
  updateClaim,
  createClaim,
} from "../api";
import type {
  ClaimDocumentItem,
  ClaimDocumentDetail,
} from "../api/types";
import { StatusBadge } from "../components/StatusBadge";
import { Loading } from "../components/Loading";
import { ErrorState } from "../components/ErrorState";
import { ClaimScoreForm } from "../components/ClaimScoreForm";

const EDITABLE_FIELDS = [
  "policy_number",
  "claim_number",
  "invoice_number",
  "provider_name",
  "claim_amount",
  "admission_date",
  "discharge_date",
  "service_date",
  "claim_date",
  "invoice_date",
  "patient_age",
  "diagnosis_code",
  "procedure_code",
  "provider_type",
  "admission_type",
  "length_of_stay",
];

type QueueFilter = "all" | "needs_review" | "reviewed" | "failed";

export const Review: React.FC = () => {
  const [claimDocs, setClaimDocs] = useState<ClaimDocumentItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [activeDoc, setActiveDoc] = useState<ClaimDocumentDetail | null>(null);
  const [correctionForm, setCorrectionForm] = useState<Record<string, string>>({});
  const [loadingDocs, setLoadingDocs] = useState<boolean>(true);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [savingCorrection, setSavingCorrection] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Queue filter
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");

  // Apply to dataset state
  const [applyingDataset, setApplyingDataset] = useState<boolean>(false);
  const [datasetToast, setDatasetToast] = useState<string | null>(null);
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [matchPickerCandidates, setMatchPickerCandidates] = useState<
    Array<Record<string, string | number | boolean | null>> | null
  >(null);

  // Scoring with ClaimScoreForm
  const [showScorer, setShowScorer] = useState<boolean>(false);

  const currentExtracted =
    activeDoc?.corrected_extraction?.fields ||
    activeDoc?.raw_extraction?.fields ||
    {};

  const fetchClaimDocs = async () => {
    setLoadingDocs(true);
    setError(null);
    try {
      const res = await listClaimDocuments();
      setClaimDocs(res.claim_documents);
      if (res.claim_documents.length > 0 && !selectedDocId && res.claim_documents[0]) {
        selectDocument(res.claim_documents[0].id);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load claim documents"
      );
    } finally {
      setLoadingDocs(false);
    }
  };

  const selectDocument = async (docId: string) => {
    setSelectedDocId(docId);
    setLoadingDetail(true);
    setSaveSuccess(false);
    setShowScorer(false);
    setDatasetToast(null);
    setDatasetError(null);
    setMatchPickerCandidates(null);
    try {
      const res = await getClaimDocument(docId);
      setActiveDoc(res.claim_document);

      const currentFields =
        res.claim_document.corrected_extraction?.fields ||
        res.claim_document.raw_extraction?.fields ||
        {};
      const initialForm: Record<string, string> = {};
      EDITABLE_FIELDS.forEach((field) => {
        const val = currentFields[field];
        initialForm[field] = val !== null && val !== undefined ? String(val) : "";
      });
      setCorrectionForm(initialForm);
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Failed to load document details"
      );
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    fetchClaimDocs();
  }, []);

  const handleDelete = async (docId: string) => {
    if (!confirm("Are you sure you want to delete this claim document?")) return;
    try {
      await deleteClaimDocument(docId);
      setClaimDocs((prev) => prev.filter((d) => d.id !== docId));
      if (selectedDocId === docId) {
        setSelectedDocId(null);
        setActiveDoc(null);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete claim document");
    }
  };

  const handleSaveCorrections = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDocId) return;

    setSavingCorrection(true);
    setSaveSuccess(false);
    try {
      const res = await reviewClaimDocument(selectedDocId, correctionForm);
      setActiveDoc(res.claim_document);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
      void fetchClaimDocs();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save field corrections");
    } finally {
      setSavingCorrection(false);
    }
  };

  const buildDatasetPayload = () => {
    const payload: Record<string, unknown> = {};
    if (correctionForm.claim_amount) {
      const n = parseFloat(correctionForm.claim_amount.replace(/[^0-9.]/g, ""));
      if (!isNaN(n)) payload.Claim_Amount = n;
    }
    if (correctionForm.service_date) {
      payload.Service_Date = correctionForm.service_date;
    } else if (correctionForm.admission_date) {
      payload.Service_Date = correctionForm.admission_date;
    }
    const claimDate = correctionForm.claim_date || correctionForm.invoice_date;
    if (claimDate) {
      payload.Claim_Date = claimDate;
    }
    if (correctionForm.policy_number) {
      payload.Policy_Number = correctionForm.policy_number;
    }
    if (correctionForm.patient_age) {
      const a = parseInt(correctionForm.patient_age, 10);
      if (!isNaN(a)) payload.Patient_Age = a;
    }
    if (correctionForm.diagnosis_code) payload.Diagnosis_Code = correctionForm.diagnosis_code;
    if (correctionForm.procedure_code) payload.Procedure_Code = correctionForm.procedure_code;
    if (correctionForm.provider_type) payload.Provider_Type = correctionForm.provider_type;
    if (correctionForm.admission_type) payload.Admission_Type = correctionForm.admission_type;
    if (correctionForm.length_of_stay) {
      const l = parseInt(correctionForm.length_of_stay, 10);
      if (!isNaN(l)) payload.Length_of_Stay_Days = l;
    }
    return payload;
  };

  const handleApplyToDataset = async () => {
    setApplyingDataset(true);
    setDatasetToast(null);
    setDatasetError(null);
    setMatchPickerCandidates(null);

    const updates = buildDatasetPayload();
    const policyNum = String(updates.Policy_Number || "");
    const claimAmt = updates.Claim_Amount as number | undefined;
    const servDate = updates.Service_Date as string | undefined;

    try {
      const matchRes = await matchClaims({
        policy_number: policyNum || undefined,
        claim_amount: claimAmt,
        service_date: servDate,
      });

      if (matchRes.count === 1 && matchRes.matches[0]) {
        const targetRowId = matchRes.matches[0].row_id as number;
        await updateClaim(targetRowId, updates);
        setDatasetToast(`Saved to dataset (row ${targetRowId}). Retrain to update predictions.`);
      } else if (matchRes.count === 0) {
        const postRes = await createClaim(updates);
        setDatasetToast(`Added as new claim to dataset (row ${postRes.row_id}). Retrain to update predictions.`);
      } else {
        setMatchPickerCandidates(matchRes.matches);
      }
    } catch (err) {
      setDatasetError(err instanceof Error ? err.message : "Failed to apply claim to dataset");
    } finally {
      setApplyingDataset(false);
    }
  };

  const handlePickCandidate = async (candidateRowId: number) => {
    setApplyingDataset(true);
    setDatasetError(null);
    const updates = buildDatasetPayload();
    try {
      await updateClaim(candidateRowId, updates);
      setDatasetToast(`Saved to dataset (row ${candidateRowId}). Retrain to update predictions.`);
      setMatchPickerCandidates(null);
    } catch (err) {
      setDatasetError(err instanceof Error ? err.message : "Failed to update selected claim");
    } finally {
      setApplyingDataset(false);
    }
  };

  const handleAddNewCandidate = async () => {
    setApplyingDataset(true);
    setDatasetError(null);
    const updates = buildDatasetPayload();
    try {
      const postRes = await createClaim(updates);
      setDatasetToast(`Added as new claim to dataset (row ${postRes.row_id}). Retrain to update predictions.`);
      setMatchPickerCandidates(null);
    } catch (err) {
      setDatasetError(err instanceof Error ? err.message : "Failed to create new claim");
    } finally {
      setApplyingDataset(false);
    }
  };

const buildPrefill = (fields: Record<string, unknown>) => {
  const vals: Record<string, string | number> = {};
  if (fields.claim_amount && fields.claim_amount !== "unavailable") {
    const n = parseFloat(String(fields.claim_amount).replace(/[^0-9.]/g, ""));
    if (!isNaN(n)) vals.Claim_Amount = n;
  }
  if (fields.patient_age && fields.patient_age !== "unavailable") {
    const a = parseInt(String(fields.patient_age), 10);
    if (!isNaN(a)) vals.Patient_Age = a;
  }
  if (fields.diagnosis_code && fields.diagnosis_code !== "unavailable") {
    vals.Diagnosis_Code = String(fields.diagnosis_code);
  }
  if (fields.procedure_code && fields.procedure_code !== "unavailable") {
    vals.Procedure_Code = String(fields.procedure_code);
  }
  if (fields.provider_type && fields.provider_type !== "unavailable") {
    vals.Provider_Type = String(fields.provider_type);
  }
  if (fields.admission_type && fields.admission_type !== "unavailable") {
    vals.Admission_Type = String(fields.admission_type);
  }
  if (fields.length_of_stay && fields.length_of_stay !== "unavailable") {
    const l = parseInt(String(fields.length_of_stay), 10);
    if (!isNaN(l)) vals.Length_of_Stay_Days = l;
  }
  if (fields.service_date && fields.service_date !== "unavailable") {
    vals.Service_Date = String(fields.service_date);
  } else if (fields.admission_date && fields.admission_date !== "unavailable") {
    vals.Service_Date = String(fields.admission_date);
  }
  if (fields.claim_date && fields.claim_date !== "unavailable") {
    vals.Claim_Date = String(fields.claim_date);
  } else if (fields.invoice_date && fields.invoice_date !== "unavailable") {
    vals.Claim_Date = String(fields.invoice_date);
  }
  return vals;
};

if (loadingDocs) {
  return (
    <div className="py-12">
      <Loading message="Loading claim adjudication queue..." />
    </div>
  );
}

if (error) {
  return (
    <div className="py-12">
      <ErrorState
        title="Adjudication Review Error"
        message={error}
        onRetry={fetchClaimDocs}
      />
    </div>
  );
}

const isFailed = (d: ClaimDocumentItem) => d.status?.toLowerCase() === "failed";
const isNeedsReview = (d: ClaimDocumentItem) =>
  !isFailed(d) && Boolean(d.validation_errors && d.validation_errors.length > 0 && !d.has_corrections);
const isReviewed = (d: ClaimDocumentItem) =>
  !isFailed(d) && Boolean(d.has_corrections || (d.validation_errors && d.validation_errors.length === 0));

const countNeedsReview = claimDocs.filter(isNeedsReview).length;
const countReviewed = claimDocs.filter(isReviewed).length;
const countFailed = claimDocs.filter(isFailed).length;
const countAll = claimDocs.length;

const filteredDocs = claimDocs.filter((d: ClaimDocumentItem) => {
  if (queueFilter === "needs_review") return isNeedsReview(d);
  if (queueFilter === "reviewed") return isReviewed(d);
  if (queueFilter === "failed") return isFailed(d);
  return true;
});

return (
  <div className="space-y-8">
    {/* Header */}
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Claim Adjudication &amp; Extraction Review
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          ADJUDICATION: Verification of extracted billings, inline rule validation, manual corrections, model scoring, and dataset synchronization.
        </p>
      </div>

      <Link
        to="/claim-extraction"
        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-accent text-bg-page hover:bg-accent/90 transition-colors"
      >
        <IconUpload size={15} />
        Go to Intake / Upload
      </Link>
    </div>

    {/* Main Grid: Document List on Left (4 cols), Detail & Correction Form on Right (8 cols) */}
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Document Ingestion & Selector */}
      <div className="lg:col-span-4 card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              Adjudication Queue ({claimDocs.length})
            </h3>
            <p className="text-[11px] text-text-muted mt-0.5">
              Ingested claims requiring adjudication and review.
            </p>
          </div>
        </div>

        {/* Queue Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: "all", label: "All", count: countAll },
            { id: "needs_review", label: "Needs review", count: countNeedsReview },
            { id: "reviewed", label: "Reviewed", count: countReviewed },
            { id: "failed", label: "Failed", count: countFailed },
          ].map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setQueueFilter(chip.id as QueueFilter)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors border ${queueFilter === chip.id
                  ? "bg-accent/20 text-accent border-accent/40 font-semibold"
                  : "bg-bg-card-alt text-text-secondary border-border hover:text-text-primary"
                }`}
            >
              {chip.label} ({chip.count})
            </button>
          ))}
        </div>

        {filteredDocs.length === 0 ? (
          <div className="p-8 text-center text-text-muted">
            <IconFileInvoice size={36} className="mx-auto text-text-muted/40 mb-2" />
            <p className="text-xs font-medium text-text-secondary">
              No claim documents in this view.
            </p>
            <p className="text-[11px] text-text-muted mt-1">
              Upload a hospital invoice or medical claim on the{" "}
              <Link to="/claim-extraction" className="text-accent underline font-semibold">
                Claim extraction
              </Link>{" "}
              page to populate this queue.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
            {filteredDocs.map((doc) => {
              const isSelected = selectedDocId === doc.id;
              return (
                <div
                  key={doc.id}
                  onClick={() => selectDocument(doc.id)}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors flex items-start justify-between gap-3 ${isSelected
                      ? "bg-accent/10 border-accent/40"
                      : "bg-bg-card-alt border-border hover:border-border/80"
                    }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-text-primary truncate" title={doc.filename}>
                      {doc.filename}
                    </div>
                    <div className="text-[11px] text-text-muted mt-1">
                      {(doc.file_size / 1024).toFixed(1)} KB &bull; {doc.created_at.slice(0, 10)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={doc.status} />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(doc.id);
                      }}
                      className="p-1 rounded text-text-muted hover:text-danger-text hover:bg-danger-bg/40 transition-colors"
                      title="Delete Document"
                    >
                      <IconTrash size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Side-by-Side Detail & Form */}
      <div className="lg:col-span-8 space-y-6">
        {loadingDetail ? (
          <Loading message="Loading extracted fields and validation checks..." className="min-h-[300px]" />
        ) : activeDoc ? (
          <div className="space-y-6">
            {showScorer ? (
              <div className="card p-6 space-y-6">
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <div>
                    <span className="text-xs uppercase tracking-wider text-accent font-semibold">
                      Model Verification Engine
                    </span>
                    <h3 className="text-base font-bold text-text-primary mt-0.5">
                      Score Claim: {activeDoc.filename}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowScorer(false)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-bg-card-alt transition-colors"
                  >
                    <IconArrowLeft size={14} />
                    Back to Document Review
                  </button>
                </div>

                <ClaimScoreForm
                  initialValues={buildPrefill(currentExtracted)}
                  initialOptionalLabels={{
                    claimId:
                      currentExtracted.claim_number !== "unavailable"
                        ? String(currentExtracted.claim_number || "")
                        : undefined,
                    policyNumber:
                      currentExtracted.policy_number !== "unavailable"
                        ? String(currentExtracted.policy_number || "")
                        : undefined,
                    providerName:
                      currentExtracted.provider_name !== "unavailable"
                        ? String(currentExtracted.provider_name || "")
                        : undefined,
                  }}
                  mode="both"
                  allowModeSwitch={true}
                  formTitle={`Extracted Claim Scoring (${activeDoc.filename})`}
                  formSubtitle="Prefilled with extracted parameters from document ingestion. Fill in missing required inputs to run prediction."
                />
              </div>
            ) : (
              <div className="card p-6 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-4">
                  <div>
                    <span className="text-xs uppercase tracking-wider text-text-muted font-medium">
                      Adjudication Inspector
                    </span>
                    <h3 className="text-base font-bold text-text-primary mt-0.5">
                      {activeDoc.filename}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setShowScorer(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-accent text-bg-page hover:bg-accent/90 transition-colors shadow-sm"
                    >
                      <IconCpu size={15} />
                      Score this claim
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyToDataset}
                      disabled={applyingDataset}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-bg-card border border-accent/40 text-accent hover:bg-accent/10 transition-colors shadow-sm disabled:opacity-50"
                    >
                      <IconDatabase size={15} />
                      {applyingDataset ? "Applying..." : "Apply to dataset"}
                    </button>
                    <StatusBadge status={activeDoc.status} />
                  </div>
                </div>

                {/* Inline Validation Errors Alert */}
                {activeDoc.validation_errors && activeDoc.validation_errors.length > 0 ? (
                  <div className="p-4 rounded-lg bg-danger-bg/60 border border-danger/40 text-danger-text space-y-2">
                    <div className="flex items-center gap-2 font-semibold text-xs">
                      <IconAlertTriangle size={16} />
                      Validation Rule Discrepancies ({activeDoc.validation_errors.length})
                    </div>
                    <ul className="text-xs space-y-1 pl-5 list-disc">
                      {activeDoc.validation_errors.map((err, idx) => (
                        <li key={idx}>{err}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-lg bg-success-bg/60 border border-success/40 text-success-text text-xs flex items-center gap-2">
                    <IconCheck size={16} />
                    All adjudication rule checks passed. No date inversions or math errors detected.
                  </div>
                )}

                {datasetToast && (
                  <div className="p-3.5 rounded-lg bg-success-bg/60 border border-success/40 text-success-text text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IconCheck size={16} />
                      <span>{datasetToast}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDatasetToast(null)}
                      className="text-xs font-semibold text-success-text hover:underline"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {datasetError && (
                  <div className="p-3.5 rounded-lg bg-danger-bg/60 border border-danger/40 text-danger-text text-xs flex items-center gap-2">
                    <IconAlertTriangle size={16} />
                    <span>{datasetError}</span>
                  </div>
                )}

                {/* Multiple Match Candidate Picker */}
                {matchPickerCandidates && (
                  <div className="p-4 rounded-lg bg-bg-card-alt border border-accent/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                          Multiple Matching Dataset Rows Found ({matchPickerCandidates.length})
                        </h4>
                        <p className="text-[11px] text-text-muted mt-0.5">
                          Select which existing claim record to update with your adjudicated corrections, or add as a new claim.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMatchPickerCandidates(null)}
                        className="p-1 text-text-muted hover:text-text-primary"
                      >
                        <IconX size={16} />
                      </button>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {matchPickerCandidates.map((m) => (
                        <div
                          key={String(m.row_id)}
                          className="p-2.5 rounded bg-bg-card border border-border flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-semibold text-accent">Row #{String(m.row_id)}</span> &bull; Claim #{String(m.Claim_ID)} &bull; Policy {String(m.Policy_Number)} &bull; ${String(m.Claim_Amount)} &bull; {String(m.Service_Date)}
                          </div>
                          <button
                            type="button"
                            onClick={() => handlePickCandidate(m.row_id as number)}
                            disabled={applyingDataset}
                            className="px-2.5 py-1 text-xs font-semibold rounded bg-accent text-bg-page hover:bg-accent/90"
                          >
                            Update Row #{String(m.row_id)}
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-border flex justify-end">
                      <button
                        type="button"
                        onClick={handleAddNewCandidate}
                        disabled={applyingDataset}
                        className="px-3 py-1.5 text-xs font-semibold rounded bg-bg-card border border-border text-text-primary hover:border-accent"
                      >
                        None of these: Add as new claim
                      </button>
                    </div>
                  </div>
                )}

                {saveSuccess && (
                  <div className="p-3 rounded-lg bg-success-bg/60 border border-success/40 text-success-text text-xs flex items-center gap-2">
                    <IconCheck size={16} />
                    Corrected fields saved and re-validated successfully!
                  </div>
                )}

                {/* Side-by-Side Comparison */}
                <form onSubmit={handleSaveCorrections} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Raw Extraction (Left) */}
                    <div className="space-y-3 p-4 rounded-lg bg-bg-card-alt border border-border">
                      <div className="text-xs font-semibold uppercase tracking-wider text-text-muted pb-2 border-b border-border">
                        Original Extraction (Read-Only)
                      </div>
                      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                        {EDITABLE_FIELDS.map((field) => {
                          const rawVal = activeDoc.raw_extraction?.fields?.[field];
                          const snippet = activeDoc.raw_extraction?.source_snippets?.[field];
                          return (
                            <div key={field} className="text-xs space-y-0.5">
                              <span className="text-[11px] text-text-muted uppercase">
                                {field.replace(/_/g, " ")}:
                              </span>
                              <div className="font-medium text-text-primary truncate">
                                {rawVal !== null && rawVal !== undefined && rawVal !== "" ? (
                                  String(rawVal)
                                ) : (
                                  <span className="text-text-muted italic">unavailable</span>
                                )}
                              </div>
                              {snippet && snippet !== "unavailable" && (
                                <p className="text-[10px] text-text-muted italic truncate">
                                  Excerpt: &ldquo;{snippet}&rdquo;
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Corrected Extraction Form (Right) */}
                    <div className="space-y-3 p-4 rounded-lg bg-bg-card-alt border border-border">
                      <div className="text-xs font-semibold uppercase tracking-wider text-accent pb-2 border-b border-border flex items-center justify-between">
                        <span>Adjudicated Corrections</span>
                        <IconEdit size={14} />
                      </div>
                      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                        {EDITABLE_FIELDS.map((field) => (
                          <div key={field} className="space-y-1">
                            <label className="block text-[11px] font-medium text-text-secondary uppercase">
                              {field.replace(/_/g, " ")}
                            </label>
                            <input
                              type={field.toLowerCase().includes("date") ? "date" : "text"}
                              value={correctionForm[field] || ""}
                              onChange={(e) =>
                                setCorrectionForm((prev) => ({
                                  ...prev,
                                  [field]: e.target.value,
                                }))
                              }
                              placeholder="unavailable"
                              className="w-full px-3 py-1.5 text-xs rounded-md bg-bg-card border border-border text-text-primary focus:border-accent focus:outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2 border-t border-border">
                    <button
                      type="submit"
                      disabled={savingCorrection}
                      className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-lg bg-accent text-bg-page hover:bg-accent/90 transition-colors disabled:opacity-50"
                    >
                      <IconCheck size={16} />
                      {savingCorrection ? "Updating & Re-validating..." : "Save Corrections"}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        ) : (
          <div className="card p-12 text-center text-text-muted">
            <IconFileInvoice size={40} className="mx-auto text-text-muted/40 mb-3" />
            <p className="text-sm font-medium text-text-secondary">
              Select a Claim Document
            </p>
            <p className="text-xs text-text-muted mt-1">
              Choose an item from the left queue to review extraction accuracy and validation rules.
            </p>
          </div>
        )}
      </div>
    </div>
  </div>
);
};