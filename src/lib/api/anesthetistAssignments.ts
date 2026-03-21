/**
 * API de asignaciones de anestesistas.
 */

import type { AnesthetistAssignment } from "../types";

export interface FetchAssignmentsFilters {
  anesthetistId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function fetchAssignments(filters?: FetchAssignmentsFilters): Promise<AnesthetistAssignment[]> {
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

  const list = (data as { assignments?: AnesthetistAssignment[] }).assignments ?? [];
  return list;
}

export async function saveAssignments(assignments: AnesthetistAssignment[]): Promise<void> {
  const res = await fetch("/api/anesthetist-assignments", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
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
    throw new Error((data as { error?: string }).error ?? "Error al guardar asignaciones");
  }
}
