import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  IconSearch,
  IconAlertTriangle,
  IconArrowRight,
  IconRefresh,
  IconEdit,
  IconCheck,
  IconX,
  IconDeviceFloppy,
} from "@tabler/icons-react";
import { searchClaim, getReviewClaims, predictClaim, updateClaim } from "../api";
import type { ReviewClaimItem } from "../api/types";
import { StatusBadge } from "../components/StatusBadge";
import { Loading } from "../components/Loading";
import { ErrorState } from "../components/ErrorState";
import { ClaimScoreForm } from "../components/ClaimScoreForm";

export const CheckClaim: React.FC = () => {
  const [tab, setTab] = useState<"existing" | "new">("existing");

  const [claimIdInput, setClaimIdInput] = useState<string>("101");
  const [searching, setSearching] = useState<boolean>(false);
  const [activeClaim, setActiveClaim] = useState<Record<string, unknown> | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [existingModelScore, setExistingModelScore] = useState<{
    fraud_probability: number;
    risk_level: "High" | "Medium" | "Low";
  } | null>(null);

  // Edit claim in dataset
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [savingEdit, setSavingEdit] = useState<boolean>(false);
  const [editToast, setEditToast] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  // Operational Database Queue
  const [queueClaims, setQueueClaims] = useState<ReviewClaimItem[]>([]);
  const [filterText, setFilterText] = useState<string>("");
  const [loadingQueue, setLoadingQueue] = useState<boolean>(true);
  const [queueError, setQueueError] = useState<string | null>(null);

  const fetchQueue = async () => {
    setLoadingQueue(true);
    setQueueError(null);
    try {
      const res = await getReviewClaims(150);
      setQueueClaims(res.claims);
    } catch (err) {
      setQueueError(
        err instanceof Error ? err.message : "Failed to load database claims queue"
      );
    } finally {
      setLoadingQueue(false);
    }
  };

  useEffect(() => {
    fetchQueue();
    // Default initial search for demo
    handleLookup("101");
  }, []);

  const handleLookup = async (id: string) => {
    const targetId = id.trim();
    if (!targetId) return;

    setSearching(true);
    setSearchError(null);
    setActiveClaim(null);
    setExistingModelScore(null);

    try {
      const res = await searchClaim(targetId);
      if (!res.claim) {
        setSearchError(`No claim record matched ID #${targetId}.`);
      } else {
        setActiveClaim(res.claim);
        try {
          const predRes = await predictClaim(
            res.claim as Record<string, string | number>,
            false
          );
          if (predRes.results && predRes.results.length > 0 && predRes.results[0]) {
            setExistingModelScore({
              fraud_probability: predRes.results[0].fraud_probability,
              risk_level: predRes.results[0].risk_level,
            });
          }
        } catch {
          setExistingModelScore(null);
        }
      }
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : "Claim query execution failed"
      );
    } finally {
      setSearching(false);
    }
  };

  const handleStartEdit = () => {
    if (!activeClaim) return;
    const initial: Record<string, string> = {};
    Object.entries(activeClaim).forEach(([k, v]) => {
      initial[k] = v !== null && v !== undefined ? String(v) : "";
    });
    setEditForm(initial);
    setIsEditing(true);
    setEditToast(null);
    setEditError(null);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditForm({});
    setEditError(null);
  };

  const handleSaveEdit = async () => {
    if (!activeClaim || activeClaim.row_id === undefined) return;
    setSavingEdit(true);
    setEditError(null);

    const rowId = Number(activeClaim.row_id);
    const changedFields: Record<string, unknown> = {};

    Object.entries(editForm).forEach(([k, val]) => {
      if (k === "row_id" || k === "Claim_ID" || k === "Patient_ID") return;
      const originalVal = activeClaim[k];
      const origStr = originalVal !== null && originalVal !== undefined ? String(originalVal) : "";
      if (val !== origStr) {
        changedFields[k] = val;
      }
    });

    if (Object.keys(changedFields).length === 0) {
      setIsEditing(false);
      setSavingEdit(false);
      return;
    }

    try {
      const res = await updateClaim(rowId, changedFields);
      setEditToast(`Saved to dataset (row ${rowId}). Retrain to update predictions.`);
      setIsEditing(false);
      await handleLookup(String(activeClaim.Claim_ID));
      void fetchQueue();
      window.dispatchEvent(
        new CustomEvent("claimSaved", { detail: { rowId, response: res } })
      );
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update claim");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleLookup(claimIdInput);
  };

  const filteredQueue = queueClaims.filter((c) => {
    if (!filterText.trim()) return true;
    const q = filterText.toLowerCase();
    return (
      String(c.claim_id).toLowerCase().includes(q) ||
      String(c.policy_number).toLowerCase().includes(q) ||
      String(c.provider_type || "").toLowerCase().includes(q) ||
      String(c.diagnosis_code || "").toLowerCase().includes(q) ||
      String(c.claim_status || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Claim Investigation &amp; Database Explorer
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Directly query specific claim records via /api/claim-search or score newly submitted claims in real time.
        </p>
      </div>

      {/* Two-Tab Switch: Existing Claim vs New Claim */}
      <div className="flex items-center p-1 bg-bg-card-alt rounded-lg border border-border w-fit">
        <button
          type="button"
          onClick={() => setTab("existing")}
          className={`px-4 py-2 text-xs font-medium rounded-md transition-colors ${
            tab === "existing"
              ? "bg-accent/20 text-accent font-semibold"
              : "text-text-muted hover:text-text-primary"
          }`}
        >
          Existing claim
        </button>
        <button
          type="button"
          onClick={() => setTab("new")}
          className={`px-4 py-2 text-xs font-medium rounded-md transition-colors ${
            tab === "new"
              ? "bg-accent/20 text-accent font-semibold"
              : "text-text-muted hover:text-text-primary"
          }`}
        >
          New claim
        </button>
      </div>

      {tab === "new" ? (
        <ClaimScoreForm
          mode="both"
          showClaimSummary={true}
          showSaveButton={true}
          onSaved={() => {
            void fetchQueue();
          }}
        />
      ) : (
        <>
          {/* Direct Claim ID Lookup Card */}
          <div className="card p-6 space-y-4">
            <div className="border-b border-border pb-3">
              <h3 className="text-sm font-semibold text-text-primary">
                Direct Claim Identifier Lookup
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Query individual claim records by unique Claim ID number.
              </p>
            </div>

            <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-muted">
                  <IconSearch size={16} />
                </div>
                <input
                  type="text"
                  value={claimIdInput}
                  onChange={(e) => setClaimIdInput(e.target.value)}
                  placeholder="Enter Claim ID (e.g. 101, 102, 103)..."
                  className="w-full pl-10 pr-4 py-2.5 text-xs rounded-lg bg-bg-card-alt border border-border text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={searching || !claimIdInput.trim()}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-semibold rounded-lg bg-accent text-bg-page hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                <IconSearch size={15} />
                {searching ? "Fetching Claim..." : "Inspect Claim"}
              </button>
            </form>

            {searchError && (
              <div className="p-3 rounded-lg bg-danger-bg/50 border border-danger/40 text-danger-text text-xs flex items-center gap-2">
                <IconAlertTriangle size={16} className="shrink-0" />
                <span>{searchError}</span>
              </div>
            )}

            {/* Detailed Claim Record Presentation */}
            {searching ? (
              <Loading message="Retrieving record from adjudication database..." className="min-h-[160px]" />
            ) : activeClaim ? (
              <div className="p-5 rounded-lg bg-bg-card-alt border border-border space-y-4 mt-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/80 pb-3">
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                      Record Details
                    </span>
                    <h4 className="text-base font-bold text-text-primary mt-0.5">
                      Claim #{String(activeClaim.Claim_ID)}
                    </h4>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={String(activeClaim.Claim_Status || "Under Review")} />
                    {activeClaim.Is_Fraudulent !== undefined && (
                      <StatusBadge
                        status={activeClaim.Is_Fraudulent ? "High" : "Low"}
                        label={activeClaim.Is_Fraudulent ? "Confirmed Fraud" : "Legitimate"}
                      />
                    )}
                    {existingModelScore && (
                      <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded bg-bg-card border border-border">
                        <span className="text-text-muted">Model Risk:</span>
                        <StatusBadge status={existingModelScore.risk_level} />
                        <span className="font-semibold text-accent">
                          {(existingModelScore.fraud_probability * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                    <Link
                      to="/verify"
                      className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-md bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
                    >
                      Verify in Model <IconArrowRight size={13} />
                    </Link>

                    {!isEditing ? (
                      <button
                        type="button"
                        onClick={handleStartEdit}
                        className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-md bg-accent text-bg-page hover:bg-accent/90 transition-colors"
                      >
                        <IconEdit size={13} />
                        Edit Claim
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleSaveEdit}
                          disabled={savingEdit}
                          className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-md bg-accent text-bg-page hover:bg-accent/90 transition-colors disabled:opacity-50"
                        >
                          <IconDeviceFloppy size={13} />
                          {savingEdit ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          disabled={savingEdit}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-border text-text-muted hover:text-text-primary transition-colors"
                        >
                          <IconX size={13} />
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {editToast && (
                  <div className="p-3 rounded-lg bg-success-bg/60 border border-success/40 text-success-text text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IconCheck size={16} />
                      <span>{editToast}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditToast(null)}
                      className="text-xs font-semibold hover:underline"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {editError && (
                  <div className="p-3 rounded-lg bg-danger-bg/60 border border-danger/40 text-danger-text text-xs flex items-center gap-2">
                    <IconAlertTriangle size={16} />
                    <span>{editError}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  {Object.entries(activeClaim).map(([key, val]) => {
                    const isReadOnlyKey = key === "row_id" || key === "Claim_ID" || key === "Patient_ID";
                    return (
                      <div key={key} className="p-2.5 rounded bg-bg-card border border-border">
                        <span className="text-[10px] font-medium text-text-muted uppercase block truncate">
                          {key.replace(/_/g, " ")} {isReadOnlyKey && isEditing && "(locked)"}
                        </span>
                        {isEditing && !isReadOnlyKey ? (
                          <input
                            type="text"
                            value={editForm[key] ?? ""}
                            onChange={(e) =>
                              setEditForm((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                            className="w-full mt-1 px-2 py-1 text-xs rounded bg-bg-card-alt border border-border text-text-primary focus:border-accent focus:outline-none"
                          />
                        ) : (
                          <span className="font-medium text-text-primary mt-0.5 block truncate">
                            {val !== null && val !== undefined && val !== ""
                              ? String(val)
                              : "N/A"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          {/* Operational Claims Database Queue */}
          <div className="card p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-4">
              <div>
                <h3 className="text-base font-semibold text-text-primary">
                  Operational Adjudication Claims Queue
                </h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  Live claims loaded directly from /api/review-claims. Click any row to inspect full fields.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Filter by ID, policy, status..."
                  className="px-3 py-1.5 text-xs rounded-lg bg-bg-card-alt border border-border text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                />
                <button
                  onClick={fetchQueue}
                  className="p-1.5 rounded-lg bg-bg-card-alt border border-border text-text-muted hover:text-text-primary transition-colors"
                  title="Refresh Queue"
                >
                  <IconRefresh size={16} />
                </button>
              </div>
            </div>

            {loadingQueue ? (
              <Loading message="Loading database claims queue..." />
            ) : queueError ? (
              <ErrorState title="Queue Error" message={queueError} onRetry={fetchQueue} />
            ) : (
              <div className="overflow-x-auto max-h-[550px]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-bg-card-alt text-text-muted uppercase text-[10px] tracking-wider border-b border-border sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3">Claim ID</th>
                      <th className="py-2.5 px-3">Policy Number</th>
                      <th className="py-2.5 px-3">Claim Amount</th>
                      <th className="py-2.5 px-3">Claim Date</th>
                      <th className="py-2.5 px-3">Provider &amp; Specialty</th>
                      <th className="py-2.5 px-3">Service Type</th>
                      <th className="py-2.5 px-3">Diagnosis Code</th>
                      <th className="py-2.5 px-3">Claim Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filteredQueue.map((claim) => (
                      <tr
                        key={claim.claim_id}
                        onClick={() => {
                          setClaimIdInput(String(claim.claim_id));
                          handleLookup(String(claim.claim_id));
                        }}
                        className="hover:bg-bg-card-alt/70 transition-colors cursor-pointer"
                      >
                        <td className="py-2.5 px-3 font-semibold text-accent">
                          #{claim.claim_id}
                        </td>
                        <td className="py-2.5 px-3 text-text-secondary">
                          {claim.policy_number}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-text-primary">
                          ${claim.claim_amount?.toLocaleString(undefined, { minimumFractionDigits: 2 }) ?? "N/A"}
                        </td>
                        <td className="py-2.5 px-3 text-text-muted">
                          {claim.claim_date || "N/A"}
                        </td>
                        <td className="py-2.5 px-3 text-text-secondary">
                          {claim.provider_type} ({claim.provider_specialty})
                        </td>
                        <td className="py-2.5 px-3 text-text-muted">
                          {claim.service_type}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-accent">
                          {claim.diagnosis_code}
                        </td>
                        <td className="py-2.5 px-3">
                          <StatusBadge status={claim.claim_status || "Under Review"} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
