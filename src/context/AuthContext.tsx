"use client";

/**
 * Contexto de autenticación.
 * DEMO: sesión en sessionStorage, login sin contraseña.
 * REAL: sesión en cookie httpOnly, login con email+contraseña vía API.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { User, UserRole } from "@/lib/types";
import { getUsers } from "@/lib/dataHelpers";
import { safeParseJSON } from "@/lib/storageSafe";
import { modoDemo } from "@/lib/config";

const SESSION_STORAGE_KEY = "bloque_quirurgico_v2_session_user";
const VALID_ROLES: UserRole[] = ["cirujano", "anestesista", "gestor", "gestor-anestesista", "endoscopista"];

function getStoredUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
  const parsed = safeParseJSON<unknown>(raw, null);
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id) return null;
  if (typeof o.name !== "string" || !o.name.trim()) return null;
  if (typeof o.email !== "string" || !o.email) return null;
  if (!VALID_ROLES.includes(o.role as UserRole)) return null;
  if (typeof o.approved !== "boolean") return null;
  return parsed as User;
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
  loginWithPassword: (email: string, password: string) => Promise<{ ok: boolean; user?: User; error?: string }>;
  setUser: (user: User | null) => void;
  hydrated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (modoDemo) {
      const stored = getStoredUser();
      const users = getUsers();
      const canonical = stored ? users.find((u) => u.id === stored.id) : null;
      if (canonical) {
        setUserState(canonical);
        setStoredUser(canonical);
      } else {
        if (stored) setStoredUser(null);
        setUserState(null);
      }
      setHydrated(true);
      return;
    }

    fetch("/api/auth/session", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setUserState(data.user);
        } else {
          setUserState(null);
        }
      })
      .catch(() => setUserState(null))
      .finally(() => setHydrated(true));
  }, []);

  const login = useCallback((u: User) => {
    setUserState(u);
    setStoredUser(u);
  }, []);

  const loginWithPassword = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error ?? "Error al iniciar sesión" };
      }
      setUserState(data.user);
      return { ok: true, user: data.user };
    } catch (err) {
      return { ok: false, error: "Error de conexión" };
    }
  }, []);

  const logout = useCallback(async () => {
    if (!modoDemo) {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } else {
      setStoredUser(null);
    }
    setUserState(null);
  }, []);

  const setUser = useCallback((u: User | null) => {
    setUserState(u);
    if (modoDemo) setStoredUser(u);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, loginWithPassword, setUser, hydrated }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
