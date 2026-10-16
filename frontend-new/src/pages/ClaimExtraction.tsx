import React, { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import {
  IconUpload,
  IconFileInvoice,
  IconCheck,
  IconAlertTriangle,
  IconArrowRight,
  IconFileCode,
  IconRefresh,
} from "@tabler/icons-react";
import {
  listClaimDocuments,
  uploadClaimDocument,
  getClaimDocument,
} from "../api";
import type {
  ClaimDocumentItem,
  ClaimDocumentDetail,
} from "../api/types";
import { StatusBadge } from "../components/StatusBadge";
import { Loading } from "../components/Loading";
import { ErrorState } from "../components/ErrorState";

export const ClaimExtraction: React.FC = () => {
  const [documents, setDocuments] = useState<ClaimDocumentItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedDocDetail, setSelectedDocDetail] = useState<ClaimDocumentDetail | null>(null);
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocs = async () => {
    setLoadingList(true);
    setError(null);
    try {
      const res = await listClaimDocuments();
      setDocuments(res.claim_documents);
      if (res.claim_documents.length > 0 && !selectedDocId && res.claim_documents[0]) {
        inspectDocument(res.claim_documents[0].id);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load claim documents"
      );
    } finally {
      setLoadingList(false);
    }
  };

  const inspectDocument = async (id: string) => {
    setSelectedDocId(id);
    setLoadingDetail(true);
    try {
      const res = await getClaimDocument(id);
      setSelectedDocDetail(res.claim_document);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to load extraction details");
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    try {
      const res = await uploadClaimDocument(file);
      setDocuments((prev) => [res.claim_document, ...prev]);
      inspectDocument(res.claim_document.id);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Document upload and extraction failed"
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  if (loadingList) {
    return (
      <div className="py-12">
        <Loading message="Loading claim document extraction feed..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12">
        <ErrorState
          title="Extraction Portal Error"
          message={error}
          onRetry={fetchDocs}
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
            Claim Document Extraction Portal
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Ingest hospital bills, clinical itemizations, and patient receipts to extract structured billing entities via automated regex and OCR parsing.
          </p>
        </div>

        <Link
          to="/review"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-bg-card border border-border text-text-primary hover:bg-bg-card-alt transition-colors"
        >
          Open Adjudication Review <IconArrowRight size={15} />
        </Link>
      </div>

      {uploadError && (
        <div className="card p-4 border-danger/40 bg-danger-bg/50 text-danger-text text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconAlertTriangle size={16} />
            <span>{uploadError}</span>
          </div>
          <button
            onClick={() => setUploadError(null)}
            className="text-xs font-semibold underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Grid: Upload Zone & Feed on Left (5 cols), Extraction Inspector on Right (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Upload & Document Feed */}
        <div className="lg:col-span-5 space-y-6">
          {/* Upload Dropzone */}
          <div className="card p-6 border-dashed border-2 border-border hover:border-accent/60 transition-colors text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 border border-accent/30 text-accent">
              <IconUpload size={24} />
            </div>

            <div>
              <h3 className="text-sm font-bold text-text-primary">
                Upload Medical Claim Document
              </h3>
              <p className="text-xs text-text-muted mt-1 max-w-xs mx-auto">
                PDF, TXT, DOCX, PNG, or JPG files (max 10 MB). System will extract policy, amount, dates, and provider entities.
              </p>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".pdf,.txt,.docx,.png,.jpg,.jpeg"
              className="hidden"
            />

            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-lg bg-accent text-bg-page hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              <IconUpload size={15} />
              {uploading ? "Extracting Entities..." : "Select File to Ingest"}
            </button>
          </div>

          {/* Ingested Documents List */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-semibold text-text-primary">
                Recent Ingestion Feed ({documents.length})
              </h3>
              <button
                onClick={fetchDocs}
                className="p-1 rounded text-text-muted hover:text-text-primary transition-colors"
                title="Refresh feed"
              >
                <IconRefresh size={15} />
              </button>
            </div>

            {documents.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-6">
                No claim documents uploaded yet. Use the zone above to ingest a bill.
              </p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {documents.map((doc) => {
                  const isSelected = selectedDocId === doc.id;
                  return (
                    <div
                      key={doc.id}
                      onClick={() => inspectDocument(doc.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                        isSelected
                          ? "bg-accent/10 border-accent/40"
                          : "bg-bg-card-alt border-border hover:border-border/80"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-text-primary truncate" title={doc.filename}>
                          {doc.filename}
                        </div>
                        <div className="text-[11px] text-text-muted mt-0.5">
                          {(doc.file_size / 1024).toFixed(1)} KB &bull; {doc.created_at.slice(0, 10)}
                        </div>
                      </div>

                      <StatusBadge status={doc.status} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Extraction Inspector Panel */}
        <div className="lg:col-span-7 space-y-6">
          {loadingDetail ? (
            <Loading message="Parsing extracted entities and text snippets..." className="min-h-[350px]" />
          ) : selectedDocDetail ? (
            <div className="card p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-4">
                <div>
                  <span className="text-xs uppercase tracking-wider text-text-muted font-medium">
                    Entity Extraction Output
                  </span>
                  <h3 className="text-base font-bold text-text-primary mt-0.5">
                    {selectedDocDetail.filename}
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <StatusBadge status={selectedDocDetail.status} />
                  <Link
                    to="/review"
                    className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-md bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
                  >
                    Adjudicate in Review <IconArrowRight size={13} />
                  </Link>
                </div>
              </div>

              {/* Validation Status Notice */}
              {selectedDocDetail.validation_errors && selectedDocDetail.validation_errors.length > 0 ? (
                <div className="p-3.5 rounded-lg bg-danger-bg/50 border border-danger/40 text-danger-text text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <IconAlertTriangle size={15} />
                    Rule Inconsistencies Detected ({selectedDocDetail.validation_errors.length}):
                  </div>
                  <ul className="list-disc pl-5 text-[11px] space-y-0.5">
                    {selectedDocDetail.validation_errors.map((vErr, vIdx) => (
                      <li key={vIdx}>{vErr}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-success-bg/50 border border-success/40 text-success-text text-xs flex items-center gap-2">
                  <IconCheck size={16} />
                  Parsed claim fields passed initial integrity checks.
                </div>
              )}

              {/* Extracted Fields Grid */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-text-primary">
                  Extracted Billing Entities
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {Object.entries(selectedDocDetail.raw_extraction?.fields || {}).map(([key, val]) => {
                    const snippet = selectedDocDetail.raw_extraction?.source_snippets?.[key];
                    const confidence = selectedDocDetail.raw_extraction?.confidence?.[key];
                    return (
                      <div
                        key={key}
                        className="p-3 rounded-lg bg-bg-card-alt border border-border space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold uppercase text-text-muted">
                            {key.replace(/_/g, " ")}
                          </span>
                          {confidence && (
                            <span className="text-[10px] text-accent font-mono">
                              {String(confidence)}
                            </span>
                          )}
                        </div>

                        <div className="text-sm font-bold text-text-primary">
                          {val !== null && val !== undefined && val !== "" ? (
                            String(val)
                          ) : (
                            <span className="text-text-muted italic font-normal text-xs">
                              unavailable
                            </span>
                          )}
                        </div>

                        {snippet && snippet !== "unavailable" && (
                          <p className="text-[10px] text-text-muted italic truncate pt-0.5">
                            Source: &ldquo;{snippet}&rdquo;
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="card p-12 text-center text-text-muted flex flex-col items-center justify-center min-h-[350px]">
              <IconFileCode size={36} className="text-text-muted/40 mb-3" />
              <p className="text-sm font-medium text-text-secondary">
                No Document Selected
              </p>
              <p className="text-xs text-text-muted mt-1 max-w-xs">
                Upload a bill or select an item from the feed to inspect automated entity extractions.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
