import type { BlockOpeningPlan } from "@/lib/types";

export interface FetchBlockPlansFilters {
  dateFrom: string;
  dateTo: string;
}

export async function fetchBlockPlans(filters: FetchBlockPlansFilters): Promise<BlockOpeningPlan[]> {
  const params = new URLSearchParams({
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  });
  const res = await fetch(`/api/block-opening-plan?${params}`, { credentials: "same-origin" });
  if (!res.ok) throw new Error("Error al cargar planes de apertura");
  const data = (await res.json()) as { plans?: BlockOpeningPlan[] };
  return data.plans ?? [];
}

export interface UpsertBlockPlanInput {
  date: string;
  resourceId: string;
  shift: "morning" | "afternoon";
  status: "OPEN" | "CLOSED" | "URGENT_RESERVED";
  minRequiredMinutes?: number;
  reservedUrgentMinutes?: number;
  notes?: string;
}

export async function upsertBlockPlan(input: UpsertBlockPlanInput): Promise<BlockOpeningPlan> {
  const res = await fetch("/api/block-opening-plan", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Error al guardar plan de apertura");
  }
  const data = (await res.json()) as { plan: BlockOpeningPlan };
  return data.plan;
}
