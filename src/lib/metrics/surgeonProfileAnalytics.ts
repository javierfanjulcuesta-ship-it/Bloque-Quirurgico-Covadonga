import type { Reservation, SlotView, User } from "@/lib/types";
import { getSlotDurationMinutes } from "@/lib/utils";

export interface ActualSurgicalAggregate {
  surgeonId: string;
  period: string;
  cases: number;
  actualMinutes: number;
  financer?: string;
}

export interface SurgeonFundingMixRow {
  financer: string;
  cases: number;
  programmedMinutes: number;
  shareCasesPct: number;
}

export interface SurgeonMonthlyTrendRow {
  month: string;
  reservations: number;
  cases: number;
  reservedMinutes: number;
  programmedMinutes: number;
  actualMinutes: number | null;
}

export interface SurgeonManagementProfile {
  surgeonId: string;
  surgeonName: string;
  reservations: number;
  activeReservations: number;
  cases: number;
  reservedMinutes: number;
  programmedMinutes: number;
  occupancyWithinReservedPct: number | null;
  actualCases: number | null;
  actualMinutes: number | null;
  actualVsReservedPct: number | null;
  actualVsProgrammedPct: number | null;
  meanLeadDays: number | null;
  medianLeadDays: number | null;
  bookedUnder7DaysPct: number | null;
  bookedUnder48hPct: number | null;
  cancellations: number;
  cancellationRatePct: number;
  releases: number;
  releaseRatePct: number;
  emptyReservations: number;
  fundingMix: SurgeonFundingMixRow[];
  monthlyTrend: SurgeonMonthlyTrendRow[];
  actualDataAvailable: boolean;
}

function isActiveReservation(r: Reservation): boolean {
  return r.status !== "cancelled" && r.status !== "released";
}

function activePatients(r: Reservation) {
  return (r.patients ?? []).filter((p) => p.scheduleStatus !== "CANCELLED");
}

function leadDays(r: Reservation): number | null {
  const created = new Date(r.createdAt);
  const surgery = new Date(`${r.date}T00:00:00.000Z`);
  if (!Number.isFinite(created.getTime()) || !Number.isFinite(surgery.getTime())) return null;
  return (surgery.getTime() - created.getTime()) / 86_400_000;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function reservationReservedMinutes(r: Reservation, slotViews: SlotView[]): number {
  const view = slotViews.find(
    (v) =>
      v.reservationId === r.id &&
      v.date === r.date &&
      v.resourceId === r.resourceId &&
      v.shift === r.shift &&
      v.slotIndex === r.slotIndex &&
      !v.isOverflowContinuation
  );
  if (typeof view?.totalMinutes === "number" && view.totalMinutes > 0) return view.totalMinutes;
  return getSlotDurationMinutes(r.shift, r.slotIndex);
}

function patientProgrammedMinutes(r: Reservation): number {
  return activePatients(r).reduce((sum, p) => {
    const minutes = p.estimatedDurationMinutes;
    return typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0 ? sum + minutes : sum;
  }, 0);
}

function monthKey(dateIso: string): string {
  return /^\d{4}-\d{2}/.test(dateIso) ? dateIso.slice(0, 7) : "Sin fecha";
}

export function buildSurgeonManagementProfiles(input: {
  reservations: Reservation[];
  slotViews?: SlotView[];
  usersDirectory?: User[];
  actualAggregates?: ActualSurgicalAggregate[];
}): SurgeonManagementProfile[] {
  const slotViews = input.slotViews ?? [];
  const actualAggregates = input.actualAggregates ?? [];
  const nameById = new Map((input.usersDirectory ?? []).map((u) => [u.id, u.name]));
  const surgeonIds = new Set<string>();

  for (const r of input.reservations ?? []) surgeonIds.add(r.surgeonId);
  for (const a of actualAggregates) surgeonIds.add(a.surgeonId);
  for (const u of input.usersDirectory ?? []) {
    if (u.role === "cirujano" || u.role === "endoscopista") surgeonIds.add(u.id);
  }

  const rows: SurgeonManagementProfile[] = [];
  for (const surgeonId of surgeonIds) {
    const allReservations = (input.reservations ?? []).filter((r) => r.surgeonId === surgeonId);
    const activeReservations = allReservations.filter(isActiveReservation);
    const cases = activeReservations.reduce((sum, r) => sum + activePatients(r).length, 0);
    const reservedMinutes = activeReservations.reduce(
      (sum, r) => sum + reservationReservedMinutes(r, slotViews),
      0
    );
    const programmedMinutes = activeReservations.reduce((sum, r) => sum + patientProgrammedMinutes(r), 0);

    const leads = allReservations
      .map(leadDays)
      .filter((value): value is number => value != null && Number.isFinite(value));
    const meanLeadDays = leads.length ? leads.reduce((sum, value) => sum + value, 0) / leads.length : null;
    const medianLeadDays = median(leads);

    const cancellations = allReservations.filter((r) => r.status === "cancelled").length;
    const releases = allReservations.filter((r) => r.status === "released").length;
    const emptyReservations = activeReservations.filter((r) => activePatients(r).length === 0).length;

    const funding = new Map<string, { cases: number; minutes: number }>();
    for (const r of activeReservations) {
      for (const patient of activePatients(r)) {
        const financer = (patient.entidadFinanciadora ?? "").trim() || "Sin financiador informado";
        const entry = funding.get(financer) ?? { cases: 0, minutes: 0 };
        entry.cases += 1;
        if (Number.isFinite(patient.estimatedDurationMinutes) && patient.estimatedDurationMinutes > 0) {
          entry.minutes += patient.estimatedDurationMinutes;
        }
        funding.set(financer, entry);
      }
    }
    const fundingMix = [...funding.entries()]
      .map(([financer, value]) => ({
        financer,
        cases: value.cases,
        programmedMinutes: value.minutes,
        shareCasesPct: cases > 0 ? (value.cases / cases) * 100 : 0,
      }))
      .sort((a, b) => b.cases - a.cases || a.financer.localeCompare(b.financer, "es"));

    const actualForSurgeon = actualAggregates.filter((a) => a.surgeonId === surgeonId);
    const actualDataAvailable = actualForSurgeon.length > 0;
    const actualCases = actualDataAvailable
      ? actualForSurgeon.reduce((sum, a) => sum + Math.max(0, a.cases), 0)
      : null;
    const actualMinutes = actualDataAvailable
      ? actualForSurgeon.reduce((sum, a) => sum + Math.max(0, a.actualMinutes), 0)
      : null;

    const monthly = new Map<string, SurgeonMonthlyTrendRow>();
    for (const r of allReservations) {
      const month = monthKey(r.date);
      const row = monthly.get(month) ?? {
        month,
        reservations: 0,
        cases: 0,
        reservedMinutes: 0,
        programmedMinutes: 0,
        actualMinutes: null,
      };
      row.reservations += 1;
      if (isActiveReservation(r)) {
        row.cases += activePatients(r).length;
        row.reservedMinutes += reservationReservedMinutes(r, slotViews);
        row.programmedMinutes += patientProgrammedMinutes(r);
      }
      monthly.set(month, row);
    }
    for (const actual of actualForSurgeon) {
      const row = monthly.get(actual.period) ?? {
        month: actual.period,
        reservations: 0,
        cases: 0,
        reservedMinutes: 0,
        programmedMinutes: 0,
        actualMinutes: 0,
      };
      row.actualMinutes = (row.actualMinutes ?? 0) + Math.max(0, actual.actualMinutes);
      monthly.set(actual.period, row);
    }

    rows.push({
      surgeonId,
      surgeonName: nameById.get(surgeonId) ?? surgeonId,
      reservations: allReservations.length,
      activeReservations: activeReservations.length,
      cases,
      reservedMinutes,
      programmedMinutes,
      occupancyWithinReservedPct:
        reservedMinutes > 0 ? Math.min(100, (programmedMinutes / reservedMinutes) * 100) : null,
      actualCases,
      actualMinutes,
      actualVsReservedPct:
        actualMinutes != null && reservedMinutes > 0 ? (actualMinutes / reservedMinutes) * 100 : null,
      actualVsProgrammedPct:
        actualMinutes != null && programmedMinutes > 0 ? (actualMinutes / programmedMinutes) * 100 : null,
      meanLeadDays,
      medianLeadDays,
      bookedUnder7DaysPct: leads.length ? (leads.filter((d) => d < 7).length / leads.length) * 100 : null,
      bookedUnder48hPct: leads.length ? (leads.filter((d) => d < 2).length / leads.length) * 100 : null,
      cancellations,
      cancellationRatePct: allReservations.length ? (cancellations / allReservations.length) * 100 : 0,
      releases,
      releaseRatePct: allReservations.length ? (releases / allReservations.length) * 100 : 0,
      emptyReservations,
      fundingMix,
      monthlyTrend: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)),
      actualDataAvailable,
    });
  }

  return rows.sort((a, b) => b.programmedMinutes - a.programmedMinutes || a.surgeonName.localeCompare(b.surgeonName, "es"));
}
