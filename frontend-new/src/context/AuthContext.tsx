import React, { createContext, useContext, useState, useEffect } from "react";

interface AuthContextType {
  isAuthenticated: boolean;
  agentName: string;
  login: (username: string, password?: string) => boolean;
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

  const login = (username: string, _password?: string): boolean => {
    // Client-side authentication gate for authorized personnel
    const effectiveName = username.trim() || "Authorized Agent";
    setIsAuthenticated(true);
    setAgentName(effectiveName);
    localStorage.setItem(AUTH_STORAGE_KEY, "true");
    localStorage.setItem(AGENT_STORAGE_KEY, effectiveName);
    return true;
  };

  const logout = () => {
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
