/**
 * Persistencia de perfiles de usuario (foto, nombre, apellidos, teléfono, especialidad).
 * Común para cirujano, endoscopista, anestesista y gestor. Lectura con parse seguro.
 */

import type { UserProfile } from "./types";
import { safeParseJSON } from "./storageSafe";

const KEY = "bloque_quirurgico_v2_perfiles";

function isValidProfile(p: unknown): p is UserProfile {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return typeof o.userId === "string" && !!o.userId && typeof o.completedAt === "string";
}

function getStore(): Record<string, UserProfile> {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(KEY);
  const parsed = safeParseJSON<Record<string, unknown> | null>(raw, null);
  if (typeof parsed !== "object" || parsed === null) return {};
  const result: Record<string, UserProfile> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (isValidProfile(v) && (v as UserProfile).userId === k) result[k] = v as UserProfile;
  }
  return result;
}

function setStore(store: Record<string, UserProfile>): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  }
}

export function getProfile(userId: string): UserProfile | null {
  const store = getStore();
  return store[userId] ?? null;
}

export function setProfile(profile: UserProfile): void {
  const store = getStore();
  store[profile.userId] = profile;
  setStore(store);
}

export function isProfileCompleted(userId: string): boolean {
  const p = getProfile(userId);
  if (!p) return false;
  return !!(p.nombre?.trim() && p.apellidos?.trim() && p.email?.trim() && p.telefono?.trim() && p.especialidad?.trim());
}
