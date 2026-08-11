/**
 * API de asignaciones de anestesistas.
 */

import type { AnesthetistAssignment } from "../types";

export interface FetchAssignmentsFilters {
  anesthetistId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AssignmentSnapshotResponse {
  assignments: AnesthetistAssignment[];
  revision: string | null;
}

export async function fetchAssignmentsSnapshot(filters?: FetchAssignmentsFilters): Promise<AssignmentSnapshotResponse> {
  const params = new URLSearchParams();
  if (filters?.anesthetistId) params.set("anesthetistId", filters.anesthetistId);
  if (filters?.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters?.dateTo) params.set("dateTo", filters.dateTo);

  const res = await fetch(`/api/anesthetist-assignments${params.toString() ? `?${params}` : ""}`, {
    credentials: "same-origin",
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Error al cargar asignaciones");
  }

  return {
    assignments: (data as { assignments?: AnesthetistAssignment[] }).assignments ?? [],
    revision: typeof (data as { revision?: unknown }).revision === "string"
      ? (data as { revision: string }).revision
      : null,
  };
}

export async function fetchAssignments(filters?: FetchAssignmentsFilters): Promise<AnesthetistAssignment[]> {
  return (await fetchAssignmentsSnapshot(filters)).assignments;
}

export async function saveAssignments(
  assignments: AnesthetistAssignment[],
  expectedRevision: string,
): Promise<string> {
  const res = await fetch("/api/anesthetist-assignments", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      expectedRevision,
      assignments: assignments.map((a) => ({
        date: a.date,
        shift: a.shift,
        assignmentType: a.assignmentType,
        resourceId: a.resourceId,
        anesthetistId: a.anesthetistId,
      })),
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const payload = data as { error?: string; code?: string };
    const err = new Error(payload.error ?? "Error al guardar asignaciones");
    (err as Error & { code?: string }).code = payload.code;
    throw err;
  }

  const revision = (data as { revision?: unknown }).revision;
  if (typeof revision !== "string") {
    throw new Error("El servidor no devolvió la nueva revisión de asignaciones");
  }
  return revision;
}
