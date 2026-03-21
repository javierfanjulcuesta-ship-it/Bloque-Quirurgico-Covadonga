/**
 * Capa de acceso a asignaciones de anestesistas.
 * modoDemo → localStorage
 * modo real → API
 */

import type { AnesthetistAssignment } from "./types";
import { modoDemo } from "./config";
import {
  getStoredAnesthetistAssignments,
  setStoredAnesthetistAssignments,
} from "./storageAnesthetistAssignments";
import {
  fetchAssignments,
  saveAssignments as apiSaveAssignments,
  type FetchAssignmentsFilters,
} from "./api/anesthetistAssignments";

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
  return fetchAssignments(filters);
}

export async function saveAssignments(assignments: AnesthetistAssignment[]): Promise<void> {
  if (modoDemo) {
    setStoredAnesthetistAssignments(assignments);
    return;
  }
  await apiSaveAssignments(assignments);
}
