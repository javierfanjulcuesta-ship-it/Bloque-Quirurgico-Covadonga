/**
 * API de usuarios (modo real).
 */

import type { User } from "@/lib/types";
import { apiFetch } from "./client";

export async function fetchUsers(opts?: { includeInactive?: boolean; includeDeleted?: boolean }): Promise<User[]> {
  const params = new URLSearchParams();
  if (opts?.includeInactive) params.set("includeInactive", "1");
  if (opts?.includeDeleted) params.set("includeDeleted", "1");
  const q = params.toString();
  const { users } = await apiFetch<{ users: User[] }>(`/users${q ? `?${q}` : ""}`);
  return users;
}
