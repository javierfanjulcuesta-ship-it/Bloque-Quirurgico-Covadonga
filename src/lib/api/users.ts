/**
 * API de usuarios (modo real).
 */

import type { User } from "@/lib/types";
import { apiFetch } from "./client";

export async function fetchUsers(opts?: { includeInactive?: boolean }): Promise<User[]> {
  const qs = opts?.includeInactive ? "?includeInactive=1" : "";
  const { users } = await apiFetch<{ users: User[] }>(`/users${qs}`);
  return users;
}
