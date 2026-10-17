import React from "react";
import { IconLoader2 } from "@tabler/icons-react";

interface LoadingProps {
  message?: string;
  className?: string;
}

export const Loading: React.FC<LoadingProps> = ({
  message = "Loading data...",
  className = "min-h-[200px]",
}) => {
  return (
    <div
      className={`card flex flex-col items-center justify-center p-8 text-center ${className}`}
    >
      <IconLoader2
        size={32}
        className="animate-spin text-accent mb-3"
      />
      <p className="text-sm font-medium text-text-secondary">{message}</p>
      <p className="text-xs text-text-muted mt-1">Please wait a moment</p>
    </div>
  );
};
