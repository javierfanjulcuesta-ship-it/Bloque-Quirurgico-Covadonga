import type { GestionCitasOverlay } from "./gestionCitas";
import { safeParseJSON } from "./storageSafe";

const KEY = "qxflow_demo_gestion_citas_v1";

export type DemoGestionCitasState = Record<string, GestionCitasOverlay>;

export function getDemoGestionCitasState(): DemoGestionCitasState {
  if (typeof window === "undefined") return {};
  const parsed = safeParseJSON<unknown>(window.localStorage.getItem(KEY), {});
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return parsed as DemoGestionCitasState;
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
  window.localStorage.setItem(KEY, JSON.stringify(next));
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
  window.localStorage.removeItem(KEY);
}
