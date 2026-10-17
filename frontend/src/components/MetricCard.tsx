import React from "react";
import type { Icon } from "@tabler/icons-react";

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: Icon;
  context?: string;
  delta?: {
    text: string;
    type?: "positive" | "negative" | "neutral";
  };
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  icon: IconComponent,
  context,
  delta,
}) => {
  return (
    <div className="card-subtle-gradient p-5 flex flex-col justify-between transition-colors hover:border-accent/40">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
          {label}
        </span>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg-card-alt border border-border text-accent">
          <IconComponent size={18} stroke={1.75} />
        </div>
      </div>

      <div className="mt-3">
        <div className="text-2xl font-bold tracking-tight text-text-primary">
          {value}
        </div>
        {(delta || context) && (
          <div className="mt-1.5 flex items-center gap-2 text-xs">
            {delta && (
              <span
                className={`font-medium ${
                  delta.type === "positive"
                    ? "text-success-text"
                    : delta.type === "negative"
                    ? "text-danger-text"
                    : "text-text-secondary"
                }`}
              >
                {delta.text}
              </span>
            )}
            {context && (
              <span className="text-text-muted truncate">{context}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
