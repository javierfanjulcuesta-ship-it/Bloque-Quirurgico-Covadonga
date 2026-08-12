/**
 * No disponibilidad del anestesista.
 *
 * - modo demo: localStorage sigue siendo la fuente de verdad del sandbox.
 * - modo real: la fuente de verdad es /api/anesthetist-unavailability (PostgreSQL).
 *   Este módulo mantiene únicamente una caché en memoria para consumidores legacy
 *   síncronos (p. ej. sugerencias del gestor); nunca escribe localStorage real.
 */

import type { AnesthetistUnavailability, Shift } from "./types";
import { modoDemo } from "./config";
import { safeParseJSON } from "./storageSafe";

const KEY = "bloque_quirurgico_anesthetist_unavailability";
const CHANGE_EVENT = "qxflow:anesthetist-unavailability-changed";

let realCache: AnesthetistUnavailability[] = [];
let realCacheLoaded = false;
let realCachePromise: Promise<void> | null = null;

function isValidEntry(u: unknown): u is AnesthetistUnavailability {
  if (!u || typeof u !== "object") return false;
  const o = u as Record<string, unknown>;
  if (typeof o.anesthetistId !== "string" || !o.anesthetistId) return false;
  if (typeof o.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) return false;
  if (o.shift !== "morning" && o.shift !== "afternoon") return false;
  return true;
}

function getDemoStore(): AnesthetistUnavailability[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(KEY);
  const parsed = safeParseJSON<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isValidEntry);
}

function setDemoStore(list: AnesthetistUnavailability[]): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

function emitRealChange(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

function rowsFromApi(payload: unknown): AnesthetistUnavailability[] {
  if (!payload || typeof payload !== "object") return [];
  const grouped = (payload as { unavailability?: unknown }).unavailability;
  if (!Array.isArray(grouped)) return [];

  const rows: AnesthetistUnavailability[] = [];
  for (const raw of grouped) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const anesthetistId = typeof item.anesthetistId === "string" ? item.anesthetistId : "";
    const date = typeof item.date === "string" ? item.date : "";
    if (!anesthetistId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (item.morning === true) {
      rows.push({ id: `server-${anesthetistId}-${date}-morning`, anesthetistId, date, shift: "morning" });
    }
    if (item.afternoon === true) {
      rows.push({ id: `server-${anesthetistId}-${date}-afternoon`, anesthetistId, date, shift: "afternoon" });
    }
  }
  return rows;
}

/**
 * Refresca la caché de lectura síncrona desde la fuente canónica real.
 * Incluso con force=true se deduplican refrescos simultáneos: dos respuestas
 * concurrentes no pueden llegar fuera de orden y restaurar una fotografía vieja.
 */
export async function hydrateRealUnavailability(force = false): Promise<void> {
  if (modoDemo || typeof window === "undefined") return;
  if (realCachePromise) return realCachePromise;
  if (realCacheLoaded && !force) return;

  const refreshPromise = (async () => {
    const response = await fetch("/api/anesthetist-unavailability", { credentials: "same-origin" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((payload as { error?: string }).error ?? "No se pudo cargar la no disponibilidad");
    realCache = rowsFromApi(payload);
    realCacheLoaded = true;
    emitRealChange();
  })();

  realCachePromise = refreshPromise;
  try {
    await refreshPromise;
  } finally {
    // Evita que el finally de una promesa antigua borre la referencia de otra
    // eventual carga futura si este código cambia para permitir solapamiento.
    if (realCachePromise === refreshPromise) realCachePromise = null;
  }
}

function getStore(): AnesthetistUnavailability[] {
  if (modoDemo) return getDemoStore();
  if (typeof window !== "undefined" && !realCacheLoaded && !realCachePromise) {
    void hydrateRealUnavailability().catch(() => {
      // El consumidor seguirá mostrando la caché vacía; los flujos que modifican
      // estado usan directamente la API y mostrarán su propio error.
    });
  }
  return realCache;
}

export function getStoredUnavailability(anesthetistId: string): AnesthetistUnavailability[] {
  return getStore().filter((u) => u.anesthetistId === anesthetistId);
}

export function isUnavailable(anesthetistId: string, date: string, shift: Shift): boolean {
  return getStore().some(
    (u) => u.anesthetistId === anesthetistId && u.date === date && u.shift === shift,
  );
}

export function getUnavailabilityForDate(anesthetistId: string, date: string): { morning: boolean; afternoon: boolean } {
  const list = getStore().filter((u) => u.anesthetistId === anesthetistId && u.date === date);
  return {
    morning: list.some((u) => u.shift === "morning"),
    afternoon: list.some((u) => u.shift === "afternoon"),
  };
}

/** Solo modo demo. En real los cambios deben pasar por la API autenticada. */
export function setUnavailability(anesthetistId: string, date: string, shift: Shift, add: boolean): void {
  if (!modoDemo) {
    throw new Error("En modo real la no disponibilidad debe guardarse mediante la API central");
  }
  const list = getDemoStore();
  const matches = (a: AnesthetistUnavailability) =>
    a.anesthetistId === anesthetistId && a.date === date && a.shift === shift;
  if (add) {
    if (list.some(matches)) return;
    list.push({
      id: `unav-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      anesthetistId,
      date,
      shift,
    });
    setDemoStore(list);
    return;
  }
  const next = list.filter((x) => !matches(x));
  if (next.length !== list.length) setDemoStore(next);
}

export function getAllUnavailability(): AnesthetistUnavailability[] {
  return getStore();
}

export function subscribeUnavailabilityChanges(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => listener();
  window.addEventListener(CHANGE_EVENT, handler);
  const storageHandler = (event: StorageEvent) => {
    if (modoDemo && event.key === KEY) listener();
  };
  window.addEventListener("storage", storageHandler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener("storage", storageHandler);
  };
}

if (!modoDemo && typeof window !== "undefined") {
  void hydrateRealUnavailability().catch(() => {});
}
