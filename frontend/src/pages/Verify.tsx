import React, { useState } from "react";
import { IconDice, IconSearch } from "@tabler/icons-react";
import { getSampleClaim, searchClaim } from "../api";
import { StatusBadge } from "../components/StatusBadge";
import { ClaimScoreForm } from "../components/ClaimScoreForm";

export const Verify: React.FC = () => {
  const [lookupClaimId, setLookupClaimId] = useState<string>("");
  const [lookingUp, setLookingUp] = useState<boolean>(false);
  const [lookupMessage, setLookupMessage] = useState<{
    text: string;
    isError?: boolean;
  } | null>(null);

  const [formData, setFormData] = useState<Record<string, string | number>>({});
  const [sampleMeta, setSampleMeta] = useState<{
    claim_id?: string | number;
    labelled_fraud?: boolean;
  } | null>(null);

  const handleLookupClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = lookupClaimId.trim();
    if (!id) return;

    setLookingUp(true);
    setLookupMessage(null);
    try {
      const res = await searchClaim(id);
      if (!res.claim) {
        setLookupMessage({
          text: res.message || `No claim found with ID #${id}`,
          isError: true,
        });
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
        setLookupMessage({
          text: `Claim #${id} successfully loaded into form.`,
        });
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
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-8">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Verify &amp; Score Claim Records
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Look up historical filings or submit custom parameters for automated
            Random Forest fraud risk scoring and SHAP explainability.
          </p>
        </div>

        <div>
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
        <form
          onSubmit={handleLookupClaim}
          className="flex flex-col sm:flex-row items-center gap-3"
        >
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
            <span className="text-xs text-text-muted">
              Historical Record Flag:
            </span>
            <StatusBadge
              status={sampleMeta.labelled_fraud ? "High" : "Low"}
              label={
                sampleMeta.labelled_fraud ? "Confirmed Fraud" : "Legitimate"
              }
            />
          </div>
        </div>
      )}

      {/* Shared Claim Form & Results Panel */}
      <ClaimScoreForm
        allowModeSwitch={true}
        initialValues={formData}
        initialOptionalLabels={{
          claimId: sampleMeta?.claim_id
            ? String(sampleMeta.claim_id)
            : undefined,
        }}
      />
    </div>
  );
};
