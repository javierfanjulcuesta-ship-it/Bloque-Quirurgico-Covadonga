/**
 * API de usuarios (modo real).
 */

import type { User } from "@/lib/types";
import { apiFetch } from "./client";

export async function fetchUsers(): Promise<User[]> {
  const { users } = await apiFetch<{ users: User[] }>("/users");
  return users;
}
