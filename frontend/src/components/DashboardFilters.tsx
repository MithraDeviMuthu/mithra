import React, { useState } from "react";
import {
  IconFilter,
  IconCalendar,
  IconCurrencyDollar,
  IconUser,
  IconRotate,
  IconChevronDown,
  IconChevronUp,
} from "@tabler/icons-react";
import type { FilterParams } from "../api";

export interface DashboardFiltersProps {
  onFilterChange: (filters: FilterParams) => void;
  initialFilters?: FilterParams;
  className?: string;
}

export const DashboardFilters: React.FC<DashboardFiltersProps> = ({
  onFilterChange,
  initialFilters = {},
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [startDate, setStartDate] = useState(initialFilters.start_date || "");
  const [endDate, setEndDate] = useState(initialFilters.end_date || "");
  const [minAmount, setMinAmount] = useState(
    initialFilters.min_amount !== undefined ? String(initialFilters.min_amount) : ""
  );
  const [maxAmount, setMaxAmount] = useState(
    initialFilters.max_amount !== undefined ? String(initialFilters.max_amount) : ""
  );
  const [minAge, setMinAge] = useState(
    initialFilters.min_age !== undefined ? String(initialFilters.min_age) : ""
  );
  const [maxAge, setMaxAge] = useState(
    initialFilters.max_age !== undefined ? String(initialFilters.max_age) : ""
  );

  const activeCount = [
    startDate,
    endDate,
    minAmount,
    maxAmount,
    minAge,
    maxAge,
  ].filter((v) => v !== "").length;

  const handleApply = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const filters: FilterParams = {};
    if (startDate) filters.start_date = startDate;
    if (endDate) filters.end_date = endDate;
    if (minAmount !== "") filters.min_amount = minAmount;
    if (maxAmount !== "") filters.max_amount = maxAmount;
    if (minAge !== "") filters.min_age = minAge;
    if (maxAge !== "") filters.max_age = maxAge;
    onFilterChange(filters);
  };

  const handleReset = () => {
    setStartDate("");
    setEndDate("");
    setMinAmount("");
    setMaxAmount("");
    setMinAge("");
    setMaxAge("");
    onFilterChange({});
  };

  return (
    <div className={`card p-4 border-border bg-bg-card-alt/80 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-accent/10 text-accent">
            <IconFilter size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-text-primary">
                Dashboard Range Filters
              </span>
              {activeCount > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-accent text-bg-page">
                  {activeCount} active
                </span>
              )}
            </div>
            <p className="text-[11px] text-text-muted mt-0.5">
              Refine analytics and KPIs by observation date, claim size, and patient age.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-card transition-colors"
            >
              <IconRotate size={14} />
              Reset
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-bg-card border border-border text-text-primary hover:border-accent/50 transition-colors"
          >
            {isOpen ? "Hide Filters" : "Filter Options"}
            {isOpen ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Filter Inputs Grid */}
      {isOpen && (
        <form onSubmit={handleApply} className="mt-4 pt-4 border-t border-border/80 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. Date Range */}
            <div className="p-3 rounded-lg bg-bg-card border border-border space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                <IconCalendar size={15} className="text-accent" />
                <span>Claim Date Range</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-[10px] font-medium text-text-muted mb-1">
                    From
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs rounded bg-bg-card-alt border border-border text-text-primary focus:border-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-text-muted mb-1">
                    To
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs rounded bg-bg-card-alt border border-border text-text-primary focus:border-accent focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* 2. Claim Amount Range */}
            <div className="p-3 rounded-lg bg-bg-card border border-border space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                <IconCurrencyDollar size={15} className="text-accent" />
                <span>Claim Amount ($)</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-[10px] font-medium text-text-muted mb-1">
                    Min ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    placeholder="e.g. 1000"
                    value={minAmount}
                    onChange={(e) => setMinAmount(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs rounded bg-bg-card-alt border border-border text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-text-muted mb-1">
                    Max ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    placeholder="e.g. 500000"
                    value={maxAmount}
                    onChange={(e) => setMaxAmount(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs rounded bg-bg-card-alt border border-border text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* 3. Patient Age Range */}
            <div className="p-3 rounded-lg bg-bg-card border border-border space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                <IconUser size={15} className="text-accent" />
                <span>Patient Age (Years)</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-[10px] font-medium text-text-muted mb-1">
                    Min Age
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="120"
                    placeholder="e.g. 18"
                    value={minAge}
                    onChange={(e) => setMinAge(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs rounded bg-bg-card-alt border border-border text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-text-muted mb-1">
                    Max Age
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="120"
                    placeholder="e.g. 65"
                    value={maxAge}
                    onChange={(e) => setMaxAge(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs rounded bg-bg-card-alt border border-border text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 text-xs font-medium rounded-lg text-text-muted hover:text-text-primary transition-colors"
            >
              Clear All
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold rounded-lg bg-accent text-bg-page hover:bg-accent/90 transition-colors"
            >
              Apply Filter Range
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
