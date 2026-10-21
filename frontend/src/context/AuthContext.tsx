import React, { createContext, useContext, useState } from "react";
import apiClient from "../api/client";

interface AuthContextType {
  isAuthenticated: boolean;
  agentName: string;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = "securescore_auth_token";
const AGENT_STORAGE_KEY = "securescore_agent_name";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem(AUTH_STORAGE_KEY) === "true";
  });

  const [agentName, setAgentName] = useState<string>(() => {
    return localStorage.getItem(AGENT_STORAGE_KEY) || "Authorized Agent";
  });

  const login = async (username: string, password: string): Promise<void> => {
    // throws ApiError (server message) or TypeError (server unreachable) on failure
    await apiClient.post("/api/login", { username: username.trim(), password });
    const effectiveName = username.trim() || "Authorized Agent";
    setIsAuthenticated(true);
    setAgentName(effectiveName);
    localStorage.setItem(AUTH_STORAGE_KEY, "true");
    localStorage.setItem(AGENT_STORAGE_KEY, effectiveName);
  };

  const logout = () => {
    apiClient.post("/api/logout").catch(() => {});
    setIsAuthenticated(false);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(AGENT_STORAGE_KEY);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        agentName,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};