/**
 * Capa de acceso a asignaciones de anestesistas.
 * modoDemo → localStorage
 * modo real → API con revisión del snapshot completo.
 */

import type { AnesthetistAssignment } from "./types";
import { modoDemo } from "./config";
import {
  getStoredAnesthetistAssignments,
  setStoredAnesthetistAssignments,
} from "./storageAnesthetistAssignments";
import { hydrateRealUnavailability } from "./storageAnesthetistUnavailability";
import {
  fetchAssignmentsSnapshot,
  saveAssignments as apiSaveAssignments,
  type FetchAssignmentsFilters,
} from "./api/anesthetistAssignments";

let editableSnapshotRevision: string | null = null;
let editableWeek: { dateFrom: string; dateTo: string } | null = null;

export async function getAssignments(filters?: FetchAssignmentsFilters): Promise<AnesthetistAssignment[]> {
  if (modoDemo) {
    const stored = getStoredAnesthetistAssignments();
    if (!filters) return stored;
    let result = stored;
    if (filters.anesthetistId) result = result.filter((a) => a.anesthetistId === filters.anesthetistId);
    if (filters.dateFrom) result = result.filter((a) => a.date >= filters.dateFrom!);
    if (filters.dateTo) result = result.filter((a) => a.date <= filters.dateTo!);
    return result;
  }

  // La carga completa es la pantalla editable del gestor. Esperamos también a la
  // no disponibilidad compartida para que el primer render con asignaciones no
  // marque como disponible a un anestesista cuya caché todavía no se hidrató.
  if (!filters) {
    const [snapshot] = await Promise.all([
      fetchAssignmentsSnapshot(),
      hydrateRealUnavailability(true),
    ]);
    editableSnapshotRevision = snapshot.revision;
    return snapshot.assignments;
  }

  const snapshot = await fetchAssignmentsSnapshot(filters);
  return snapshot.assignments;
}

/** Carga la semana editable y recuerda su revisión. No reescribe otras semanas. */
export async function loadEditableAssignmentWeek(dateFrom: string, dateTo: string): Promise<AnesthetistAssignment[]> {
  editableWeek = { dateFrom, dateTo };
  if (modoDemo) {
    editableSnapshotRevision = "demo";
    return getAssignments({ dateFrom, dateTo });
  }
  const snapshot = await fetchAssignmentsSnapshot({ dateFrom, dateTo });
  if (!snapshot.revision) {
    throw new Error("El servidor no devolvió la revisión de la semana.");
  }
  editableSnapshotRevision = snapshot.revision;
  return snapshot.assignments;
}

export async function saveAssignments(assignments: AnesthetistAssignment[]): Promise<void> {
  if (!editableWeek) {
    throw new Error("Recargue la semana antes de guardar.");
  }
  const { dateFrom, dateTo } = editableWeek;
  const inWeek = assignments.filter((assignment) => assignment.date >= dateFrom && assignment.date <= dateTo);

  if (modoDemo) {
    const kept = getStoredAnesthetistAssignments().filter(
      (assignment) => assignment.date < dateFrom || assignment.date > dateTo,
    );
    setStoredAnesthetistAssignments([...kept, ...inWeek]);
    return;
  }

  if (!editableSnapshotRevision) {
    throw new Error("Recargue las asignaciones antes de guardar para evitar sobrescribir cambios concurrentes.");
  }

  editableSnapshotRevision = await apiSaveAssignments(inWeek, editableSnapshotRevision, { dateFrom, dateTo });
}
