import type { GestionCitasOverlay } from "./gestionCitas";
import { safeParseJSON } from "./storageSafe";

export const DEMO_GESTION_CITAS_STORAGE_KEY = "qxflow_demo_gestion_citas_v1";

export type DemoGestionCitasState = Record<string, GestionCitasOverlay>;

export function getDemoGestionCitasState(): DemoGestionCitasState {
  if (typeof window === "undefined") return {};
  const parsed = safeParseJSON<unknown>(window.localStorage.getItem(DEMO_GESTION_CITAS_STORAGE_KEY), {});
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return parsed as DemoGestionCitasState;
}

export function setDemoGestionCitasState(state: DemoGestionCitasState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEMO_GESTION_CITAS_STORAGE_KEY, JSON.stringify(state));
}

export function updateDemoGestionCitasPatient(patientId: string, patch: GestionCitasOverlay): DemoGestionCitasState {
  if (typeof window === "undefined" || !patientId) return {};
  const current = getDemoGestionCitasState();
  const previous = current[patientId] ?? {};
  const next: DemoGestionCitasState = {
    ...current,
    [patientId]: {
      ...previous,
      ...patch,
    },
  };
  setDemoGestionCitasState(next);
  return next;
}

export function registerDemoGestionCitasAttempt(patientId: string, status: GestionCitasOverlay["confirmationStatus"]): DemoGestionCitasState {
  const current = getDemoGestionCitasState();
  const previous = current[patientId] ?? {};
  return updateDemoGestionCitasPatient(patientId, {
    confirmationStatus: status,
    attemptCount: (previous.attemptCount ?? 0) + 1,
    lastAttemptAt: new Date().toISOString(),
  });
}

export function clearDemoGestionCitasState(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DEMO_GESTION_CITAS_STORAGE_KEY);
}
