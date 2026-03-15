"use client";

/**
 * Contexto de autenticación. La sesión se persiste en sessionStorage
 * y se restaura al recargar la página.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { User } from "@/lib/types";

const SESSION_STORAGE_KEY = "bloque_quirurgico_v2_session_user";

function getStoredUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as User;
    if (!parsed?.id || !parsed?.email || !parsed?.role) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setStoredUser(user: User | null) {
  if (typeof window === "undefined") return;
  if (user) {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
  } else {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

interface AuthContextType {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  setUser: (user: User | null) => void;
  hydrated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = getStoredUser();
    if (stored) setUserState(stored);
    setHydrated(true);
  }, []);

  const login = useCallback((u: User) => {
    setUserState(u);
    setStoredUser(u);
  }, []);

  const logout = useCallback(() => {
    setUserState(null);
    setStoredUser(null);
  }, []);

  const setUser = useCallback((u: User | null) => {
    setUserState(u);
    setStoredUser(u);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, setUser, hydrated }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
