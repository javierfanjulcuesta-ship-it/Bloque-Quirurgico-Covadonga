"use client";

/**
 * Contexto de usuarios.
 * DEMO: devuelve MOCK_USERS.
 * REAL: obtiene usuarios desde /api/users (solo cuando hay sesión).
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { User } from "@/lib/types";
import { MOCK_USERS } from "@/lib/dataHelpers";
import { modoDemo } from "@/lib/config";
import { fetchUsers } from "@/lib/api/users";
import { setUsersCache } from "@/lib/usersCache";
import { useAuth } from "./AuthContext";

interface UsersContextType {
  users: User[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const UsersContext = createContext<UsersContextType | undefined>(undefined);

export function UsersProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>(modoDemo ? MOCK_USERS : []);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (modoDemo) {
      setUsers(MOCK_USERS);
      return;
    }
    if (!user) {
      setUsers([]);
      return;
    }
    setLoading(true);
    try {
      const list = await fetchUsers();
      setUsers(list);
      setUsersCache(list);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [modoDemo, user]);

  useEffect(() => {
    if (modoDemo) {
      setUsers(MOCK_USERS);
      return;
    }
    if (user) {
      refresh();
    } else {
      setUsers([]);
    }
  }, [modoDemo, user, refresh]);

  return (
    <UsersContext.Provider value={{ users, loading, refresh }}>
      {children}
    </UsersContext.Provider>
  );
}

export function useUsers() {
  const ctx = useContext(UsersContext);
  if (ctx === undefined) throw new Error("useUsers must be used within UsersProvider");
  return ctx;
}
