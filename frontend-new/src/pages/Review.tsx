import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  IconFileInvoice,
  IconCheck,
  IconAlertTriangle,
  IconEdit,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import {
  listClaimDocuments,
  getClaimDocument,
  reviewClaimDocument,
  deleteClaimDocument,
} from "../api";
import type { ClaimDocumentItem, ClaimDocumentDetail } from "../api/types";
import { StatusBadge } from "../components/StatusBadge";
import { Loading } from "../components/Loading";
import { ErrorState } from "../components/ErrorState";

const EDITABLE_FIELDS = [
  "policy_number",
  "claim_number",
  "invoice_number",
  "provider_name",
  "claim_amount",
  "admission_date",
  "discharge_date",
  "service_date",
  "invoice_date",
];

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
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save field corrections");
    } finally {
      setSavingCorrection(false);
    }
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Claim Adjudication &amp; Extraction Review
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Side-by-side verification of extracted billings, inline rule validation discrepancies, and manual field overrides.
          </p>
        </div>

        <Link
          to="/claim-extraction"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-accent text-bg-page hover:bg-accent/90 transition-colors"
        >
          <IconUpload size={15} />
          Upload New Claim File
        </Link>
      </div>

      {/* Main Grid: Document List on Left (4 cols), Detail & Correction Form on Right (8 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Document Ingestion & Selector */}
        <div className="lg:col-span-4 card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                Ingested Claim Files ({claimDocs.length})
              </h3>
              <p className="text-[11px] text-text-muted mt-0.5">
                Processed OCR &amp; regex documents.
              </p>
            </div>
          </div>

          {claimDocs.length === 0 ? (
            <div className="p-8 text-center text-text-muted">
              <IconFileInvoice size={36} className="mx-auto text-text-muted/40 mb-2" />
              <p className="text-xs font-medium text-text-secondary">
                No claim documents in queue.
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
              {claimDocs.map((doc) => {
                const isSelected = selectedDocId === doc.id;
                return (
                  <div
                    key={doc.id}
                    onClick={() => selectDocument(doc.id)}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors flex items-start justify-between gap-3 ${
                      isSelected
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
            <div className="card p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <span className="text-xs uppercase tracking-wider text-text-muted font-medium">
                    Adjudication Inspector
                  </span>
                  <h3 className="text-base font-bold text-text-primary mt-0.5">
                    {activeDoc.filename}
                  </h3>
                </div>
                <StatusBadge status={activeDoc.status} />
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
                    <div className="space-y-3">
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
                    <div className="space-y-3">
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
