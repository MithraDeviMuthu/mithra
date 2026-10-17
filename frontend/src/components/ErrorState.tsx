import React from "react";
import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = "Something went wrong",
  message,
  onRetry,
  className = "min-h-[200px]",
}) => {
  return (
    <div
      className={`card border-danger/40 bg-danger-bg/40 flex flex-col items-center justify-center p-8 text-center ${className}`}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-bg border border-danger/30 text-danger-text mb-3">
        <IconAlertTriangle size={24} />
      </div>
      <h3 className="text-base font-semibold text-text-primary">{title}</h3>
      <p className="mt-1 text-sm text-danger-text max-w-md">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-bg-card border border-border text-text-primary hover:bg-bg-card-alt transition-colors"
        >
          <IconRefresh size={14} />
          Retry
        </button>
      )}
    </div>
  );
};
