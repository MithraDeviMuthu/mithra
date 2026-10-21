import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconShieldLock,
  IconLock,
  IconUser,
  IconArrowRight,
  IconShieldCheck,
} from "@tabler/icons-react";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api/client";

export const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(username, password);
      navigate("/overview");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Cannot reach the API server. Is python api/app.py running on port 5000?"
      );
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-page flex flex-col items-center justify-center p-4 selection:bg-accent/30 selection:text-text-primary">
      {/* Background glow effect */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-accent/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md space-y-8 relative z-10">
        {/* Brand & Badge Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 border border-accent/30 text-accent shadow-sm">
            <IconShieldLock size={32} stroke={1.75} />
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              SecureScore
            </h1>
            <p className="text-xs font-medium tracking-wide uppercase text-accent mt-0.5">
              Intelligent Verification Portal
            </p>
          </div>

          <p className="text-xs text-text-secondary max-w-sm mx-auto leading-relaxed">
              Verification portal — authorized person only. Encrypted session security.
          </p>
        </div>

        {/* Login Card */}
        <div className="card p-8 shadow-xl space-y-6 border border-border">
          <div className="border-b border-border pb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Agent Authentication
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success-text bg-success-bg px-2 py-0.5 rounded-full border border-success/30">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              Portal Online
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="username"
                className="block text-xs font-medium text-text-secondary"
              >
                Agent Identifier / Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted">
                  <IconUser size={16} />
                </div>
                <input
                  id="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter authorized identifier"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-bg-card-alt border border-border text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-xs font-medium text-text-secondary"
              >
                Security Access Token / Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted">
                  <IconLock size={16} />
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter security token"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-bg-card-alt border border-border text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            {error && (
              <p role="alert" className="text-xs text-danger-text">
                {error}
              </p>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-accent text-bg-page hover:bg-accent/90 transition-all duration-150 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <span className="h-3.5 w-3.5 border-2 border-bg-page border-t-transparent rounded-full animate-spin" />
                    Authenticating Session...
                  </>
                ) : (
                  <>
                    Sign in securely
                    <IconArrowRight size={15} />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Security Notice */}
          <div className="p-3 rounded-lg bg-bg-card-alt border border-border text-[11px] text-text-muted flex items-start gap-2">
            <IconShieldCheck size={16} className="text-accent shrink-0 mt-0.5" />
            <span>
              All portal telemetry, automated fraud scoring, and database interactions are cryptographically scoped to this browser session.
            </span>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-text-muted">
          SecureScore Fraud-Risk Scoring & Claim Verification Platform
        </p>
      </div>
    </div>
  );
};