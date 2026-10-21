import React from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { TopNav } from "./components/layout/TopNav";
import { Login } from "./pages/Login";
import { Overview } from "./pages/Overview";
import { PersonClaim } from "./pages/PersonClaim";
import { Verify } from "./pages/Verify";
import { Review } from "./pages/Review";
import { Insights } from "./pages/Insights";
import { Analytics } from "./pages/Analytics";
import { CheckClaim } from "./pages/CheckClaim";
import { Patterns } from "./pages/Patterns";
import { ClaimExtraction } from "./pages/ClaimExtraction";

function AppContent() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  // If not authenticated, always show the Login screen
  if (!isAuthenticated) {
    return <Login />;
  }

  // When authenticated, if visiting root "/", redirect to "/overview"
  if (location.pathname === "/") {
    return <Navigate to="/overview" replace />;
  }

  return (
    <div className="min-h-screen bg-bg-page text-text-primary selection:bg-accent/30 selection:text-text-primary">
      {/* Horizontal TopNav with 9 items + Authorized Agent indicator + Sign Out */}
      <TopNav />

      {/* Main page content */}
      <main className="mx-auto max-w-[1440px] px-4 sm:px-6 py-8">
        <Routes>
          <Route path="/overview" element={<Overview />} />
          <Route path="/person-claim" element={<PersonClaim />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/review" element={<Review />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/check-claim" element={<CheckClaim />} />
          <Route path="/patterns" element={<Patterns />} />
          <Route path="/claim-extraction" element={<ClaimExtraction />} />
          {/* Fallback to Overview */}
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
