import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { IconShieldCheck, IconLogout, IconUserCheck } from "@tabler/icons-react";
import { useAuth } from "../../context/AuthContext";

interface NavItem {
  name: string;
  path: string;
}

const NAV_ITEMS: NavItem[] = [
  { name: "Overview", path: "/overview" },
  { name: "Person claim", path: "/person-claim" },
  { name: "Verify", path: "/verify" },
  { name: "Review", path: "/review" },
  { name: "Insights", path: "/insights" },
  { name: "Analytics", path: "/analytics" },
  { name: "Check a claim", path: "/check-claim" },
  { name: "Patterns", path: "/patterns" },
  { name: "Claim extraction", path: "/claim-extraction" },
];

export const TopNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { agentName, logout } = useAuth();

  const isActive = (path: string) => {
    return location.pathname === path || (path !== "/overview" && location.pathname.startsWith(path));
  };

  const signOut = () => {
    logout();
    navigate("/", { replace: true });
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-bg-nav/95 backdrop-blur shadow-sm">
      <div className="mx-auto flex flex-col md:flex-row md:items-center md:justify-between px-4 sm:px-6 py-2.5 gap-2.5 max-w-[1440px]">
        {/* Brand & Left Group */}
        <div className="flex items-center justify-between gap-4">
          <Link to="/overview" className="flex items-center gap-2.5 shrink-0 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 border border-accent/30 text-accent transition-colors group-hover:bg-accent/25">
              <IconShieldCheck size={20} stroke={2} />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-text-primary leading-tight">
                SecureScore
              </span>
              <span className="text-[9px] uppercase tracking-wider text-text-muted">
                Intelligent System
              </span>
            </div>
          </Link>

          {/* Mobile Right Controls */}
          <div className="flex items-center gap-2 md:hidden">
            <span
              title={agentName}
              className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary bg-bg-card px-2 py-0.5 rounded border border-border"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Authorized Agent
            </span>
            <button
              onClick={signOut}
              className="p-1 rounded text-text-muted hover:text-danger-text transition-colors"
              title="Sign Out"
            >
              <IconLogout size={16} />
            </button>
          </div>
        </div>

        {/* 9 Horizontal Navigation Items (scrollable or wrapping, full text, >= 12px) */}
        <nav aria-label="Main navigation" className="flex min-w-0 items-center gap-1 overflow-x-auto py-1 sm:gap-1.5 md:flex-1 md:mx-2 scrollbar-none">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`whitespace-nowrap px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-150 shrink-0 ${
                  active
                    ? "bg-accent/15 text-accent border border-accent/40 font-semibold shadow-xs"
                    : "text-text-secondary hover:text-text-primary hover:bg-bg-card-alt border border-transparent"
                }`}
              >
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Desktop Right User & Logout Controls */}
        <div className="hidden md:flex items-center gap-3 shrink-0">
          <div
            title={agentName}
            className="flex items-center gap-1.5 text-xs text-text-secondary bg-bg-card-alt px-2.5 py-1 rounded-md border border-border"
          >
            <IconUserCheck size={14} className="text-success" />
            <span className="font-medium text-text-primary">Authorized Agent</span>
          </div>

          <button
            onClick={signOut}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-bg-card border border-border text-text-secondary hover:text-danger-text hover:border-danger/40 transition-colors"
          >
            <IconLogout size={14} />
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
};
