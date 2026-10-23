import React from "react";
import { ClaimScoreForm } from "../components/ClaimScoreForm";

export const CheckClaim: React.FC = () => {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          New Claim
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Enter the details of a newly submitted claim to score fraud risk and
          predict claim status in real time.
        </p>
      </div>

      <ClaimScoreForm mode="both" showClaimSummary={true} showSaveButton={true} />
    </div>
  );
};