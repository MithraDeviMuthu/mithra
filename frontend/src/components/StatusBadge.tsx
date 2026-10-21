import React from "react";

export type StatusType =
  | "Approved"
  | "Rejected"
  | "Under Review"
  | "Rising"
  | "Stable"
  | "Falling"
  | "High"
  | "Medium"
  | "Low"
  | "exact"
  | "near"
  | "review_candidates"
  | "clear"
  | "Verified"
  | "Uncertain"
  | "Inconclusive"
  | string;

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  className = "",
}) => {
  const normalized = String(status).trim().toLowerCase();

  // Determine variant
  let variantClasses = "";

  if (
    [
      "approved",
      "falling",
      "low",
      "clear",
      "verified",
      "ready",
      "success",
    ].includes(normalized)
  ) {
    // Success tint pair: --success-bg: #1C2420, --success-text: #90B99A
    variantClasses = "bg-success-bg text-success-text border-success/30";
  } else if (
    [
      "rejected",
      "rising",
      "high",
      "exact",
      "review_candidates",
      "failed",
      "danger",
      "fraud",
    ].includes(normalized)
  ) {
    // Danger tint pair: --danger-bg: #2A1E20, --danger-text: #D59798
    variantClasses = "bg-danger-bg text-danger-text border-danger/30";
  } else if (
    [
      "under review",
      "medium",
      "near",
      "uncertain",
      "processing",
      "warning",
    ].includes(normalized)
  ) {
    // Subtle amber / accent tint for in-between review states
    variantClasses = "bg-[#252018] text-[#E0B26D] border-[#E0B26D]/30";
  } else {
    // Neutral (Stable, Inconclusive, Not enough history, etc.)
    variantClasses = "bg-bg-card-alt text-text-secondary border-border";
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${variantClasses} ${className}`}
    >
      {label || status}
    </span>
  );
};
