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
import {
  fetchAssignmentsSnapshot,
  saveAssignments as apiSaveAssignments,
  type FetchAssignmentsFilters,
} from "./api/anesthetistAssignments";

let editableSnapshotRevision: string | null = null;

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

  const snapshot = await fetchAssignmentsSnapshot(filters);
  if (!filters) editableSnapshotRevision = snapshot.revision;
  return snapshot.assignments;
}

export async function saveAssignments(assignments: AnesthetistAssignment[]): Promise<void> {
  if (modoDemo) {
    setStoredAnesthetistAssignments(assignments);
    return;
  }

  if (!editableSnapshotRevision) {
    throw new Error("Recargue las asignaciones antes de guardar para evitar sobrescribir cambios concurrentes.");
  }

  editableSnapshotRevision = await apiSaveAssignments(assignments, editableSnapshotRevision);
}
