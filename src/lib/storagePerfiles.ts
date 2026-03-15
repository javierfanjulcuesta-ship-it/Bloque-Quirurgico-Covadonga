/**
 * Persistencia de perfiles de usuario (foto, nombre, apellidos, teléfono, especialidad).
 * Común para cirujano, endoscopista, anestesista y gestor. Ningún campo es obligatorio.
 */

import type { UserProfile } from "./types";

const KEY = "bloque_quirurgico_v2_perfiles";

function getStore(): Record<string, UserProfile> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, UserProfile>;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
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
