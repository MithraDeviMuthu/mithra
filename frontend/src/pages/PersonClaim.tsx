import React, { useEffect, useState } from "react";
import {
  IconUser,
  IconSearch,
  IconFileText,
  IconAlertTriangle,
  IconCheck,
  IconShieldCheck,
  IconCalendar,
  IconCurrencyDollar,
} from "@tabler/icons-react";
import { searchPerson, getPersonClaims } from "../api";
import type { PersonSearchResult } from "../api/types";
import { StatusBadge } from "../components/StatusBadge";
import { Loading } from "../components/Loading";
import { ErrorState } from "../components/ErrorState";

export const PersonClaim: React.FC = () => {
  const [identifier, setIdentifier] = useState<string>("");
  const [searching, setSearching] = useState<boolean>(false);
  const [results, setResults] = useState<PersonSearchResult[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<number | string | null>(null);
  const [patientClaims, setPatientClaims] = useState<Record<string, unknown>[]>([]);
  const [loadingClaims, setLoadingClaims] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e?: React.FormEvent, overrideId?: string) => {
    if (e) e.preventDefault();
    const q = overrideId !== undefined ? overrideId.trim() : identifier.trim();

    setSearching(true);
    setError(null);
    setResults([]);
    setSelectedPatientId(q ? q : null);
    setPatientClaims([]);

    try {
      const claimsRes = await getPersonClaims(q);
      setPatientClaims(claimsRes.claims);

      if (q) {
        try {
          const personRes = await searchPerson(q);
          setResults(personRes.results);
        } catch {
          setResults([]);
        }
      }

      if (claimsRes.claims.length === 0) {
        setError(q ? `No claims found for Patient ID "${q}".` : "No claims found in database.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Person search query failed"
      );
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    void handleSearch();
  }, []);

  const loadPatientClaims = async (patientId: number | string) => {
    setSelectedPatientId(patientId);
    setLoadingClaims(true);
    try {
      const res = await getPersonClaims(String(patientId));
      setPatientClaims(res.claims);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to load claims for patient");
    } finally {
      setLoadingClaims(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Person &amp; Policy Claim History
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Search patient records or policy numbers to inspect historical filings, cumulative exposures, and claim status breakdowns.
        </p>
      </div>

      {/* Search Input Bar */}
      <div className="card p-6">
        <form onSubmit={handleSearch} className="space-y-4">
          <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted">
            Search Patient ID or Policy Number
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-muted">
                <IconSearch size={16} />
              </div>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Enter Patient ID (e.g. 67349080) or leave blank for all claims..."
                className="w-full pl-10 pr-4 py-2.5 text-xs rounded-lg bg-bg-card-alt border border-border text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-semibold rounded-lg bg-accent text-bg-page hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              <IconSearch size={15} />
              {searching ? "Searching Records..." : "Search Claims"}
            </button>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-text-muted pt-1">
            <span>Quick Test Identifiers:</span>
            {["67349080", "85973291", "62454860", "58632240"].map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setIdentifier(id);
                  void handleSearch(undefined, id);
                }}
                className="px-2 py-0.5 rounded bg-bg-card-alt border border-border text-text-secondary hover:text-text-primary transition-colors"
              >
                #{id}
              </button>
            ))}
          </div>
        </form>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-danger-bg/50 border border-danger/40 text-danger-text text-xs flex items-center gap-2">
            <IconAlertTriangle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {searching && (
        <Loading message="Scanning patient database and policy registries..." />
      )}

      {/* Results Section */}
      {!searching && (results.length > 0 || patientClaims.length > 0) && (
        <div className="space-y-6">
          {/* Matched Patients Summary Cards */}
          {results.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((patient) => {
              const isSelected = selectedPatientId === patient.patient_id;
              return (
                <div
                  key={patient.patient_id}
                  onClick={() => loadPatientClaims(patient.patient_id)}
                  className={`card p-5 cursor-pointer transition-all border ${
                    isSelected
                      ? "bg-accent/10 border-accent/60 shadow-sm"
                      : "bg-bg-card border-border hover:border-accent/40"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-bg-card-alt border border-border text-accent">
                          <IconUser size={16} />
                        </div>
                        <h3 className="text-sm font-bold text-text-primary">
                          Patient #{patient.patient_id}
                        </h3>
                      </div>
                      <p className="text-[11px] text-text-muted mt-2">
                        Policy: {patient.policy_numbers.join(", ") || "None recorded"}
                      </p>
                    </div>
                    {isSelected && (
                      <span className="text-[10px] font-semibold text-accent uppercase tracking-wider px-2 py-0.5 rounded bg-accent/20 border border-accent/30">
                        Active Selection
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-border/70 text-xs">
                    <div>
                      <span className="text-[10px] text-text-muted uppercase block">Total Filings</span>
                      <span className="text-text-primary font-bold">
                        {patient.claim_count} claims
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-text-muted uppercase block">Total Billed</span>
                      <span className="text-accent font-bold">
                        ${patient.total_claim_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {patient.status_breakdown && (
                    <div className="mt-3 pt-2 flex flex-wrap gap-1.5">
                      {Object.entries(patient.status_breakdown).map(([st, cnt]) => (
                        <StatusBadge key={st} status={st} label={`${st}: ${cnt}`} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          )}

          {/* Claims History Table */}
          {(selectedPatientId || patientClaims.length > 0) && (
            <div className="card p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <h3 className="text-base font-semibold text-text-primary">
                    {selectedPatientId ? `Historical Claims for Patient #${selectedPatientId}` : "All Claims History"}
                  </h3>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {patientClaims.length} total claim records linked to this {selectedPatientId ? "verified identity" : "query"}.
                  </p>
                </div>
              </div>

              {loadingClaims ? (
                <Loading message="Loading claim records for selected patient..." className="min-h-[180px]" />
              ) : patientClaims.length === 0 ? (
                <div className="p-8 text-center text-text-muted">
                  <IconFileText size={32} className="mx-auto text-text-muted/40 mb-2" />
                  <p className="text-xs font-medium text-text-secondary">
                    No individual claim records found for this patient.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-bg-card-alt text-text-muted uppercase text-[10px] tracking-wider border-b border-border">
                      <tr>
                        <th className="py-2.5 px-3">Claim ID</th>
                        <th className="py-2.5 px-3">Policy Number</th>
                        <th className="py-2.5 px-3">Claim Date</th>
                        <th className="py-2.5 px-3">Service Date</th>
                        <th className="py-2.5 px-3">Provider &amp; Specialty</th>
                        <th className="py-2.5 px-3">Amount</th>
                        <th className="py-2.5 px-3">Claim Status</th>
                        <th className="py-2.5 px-3">Fraud Audit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {patientClaims.map((claim, idx) => (
                        <tr key={idx} className="hover:bg-bg-card-alt/50 transition-colors">
                          <td className="py-2.5 px-3 font-semibold text-text-primary">
                            #{String(claim.Claim_ID)}
                          </td>
                          <td className="py-2.5 px-3 text-text-secondary">
                            {String(claim.Policy_Number || "N/A")}
                          </td>
                          <td className="py-2.5 px-3 text-text-muted">
                            {String(claim.Claim_Date || "N/A")}
                          </td>
                          <td className="py-2.5 px-3 text-text-muted">
                            {String(claim.Service_Date || "N/A")}
                          </td>
                          <td className="py-2.5 px-3 text-text-secondary">
                            {String(claim.Provider_Type || "Facility")} ({String(claim.Provider_Specialty || "General")})
                          </td>
                          <td className="py-2.5 px-3 font-medium text-text-primary">
                            ${Number(claim.Claim_Amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2.5 px-3">
                            <StatusBadge status={String(claim.Claim_Status || "Under Review")} />
                          </td>
                          <td className="py-2.5 px-3">
                            {claim.Is_Fraudulent ? (
                              <StatusBadge status="High" label="Flagged Fraud" />
                            ) : (
                              <StatusBadge status="Low" label="Legitimate" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
