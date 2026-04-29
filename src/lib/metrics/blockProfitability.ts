import { TRANSITION_MINUTES_PER_PROCEDURE } from "@/lib/constants";
import type { EconomicConfig } from "@/lib/metrics/economicConfig";
import { isPrivateFunding, isSespa } from "@/lib/patientInsurance";
import type { Reservation, Shift, SlotView, User } from "@/lib/types";

type ProfitBand = "rentable" | "ajustado" | "perdida";

export interface ProfitabilityTurnRow {
  date: string;
  shift: Shift;
  marginTotal: number;
  marginPerMinute: number | null;
  occupancy: number;
  idleMinutes: number;
  band: ProfitBand;
}

export interface ProfitabilityRoomRow {
  resourceId: string;
  margin: number;
  occupancy: number;
  dispersion: number;
  band: ProfitBand;
}

export interface ProfitabilitySurgeonRow {
  surgeonId: string;
  surgeonName: string;
  avgMargin: number | null;
  avgDuration: number | null;
  variability: number | null;
  cancellationRate: number;
  band: ProfitBand;
}

export interface ProfitabilityProcedureRow {
  procedure: string;
  avgMargin: number | null;
  avgDuration: number | null;
  variability: number | null;
  band: ProfitBand;
}

export interface BlockProfitabilityAnalysis {
  byTurn: ProfitabilityTurnRow[];
  byOperatingRoom: ProfitabilityRoomRow[];
  bySurgeon: ProfitabilitySurgeonRow[];
  byProcedure: ProfitabilityProcedureRow[];
  topLossSources: Array<{ source: string; margin: number }>;
}

export interface AnalyzeBlockProfitabilityInput {
  reservations: Reservation[];
  slotViews: SlotView[];
  economicConfig: EconomicConfig;
  usersDirectory?: User[];
}

function bandFromMargin(margin: number): ProfitBand {
  if (margin > 0) return "rentable";
  if (margin > -250) return "ajustado";
  return "perdida";
}

function rateByInsurance(funding: string | undefined, cfg: EconomicConfig): number {
  const value = (funding ?? "").trim();
  if (isPrivateFunding(value)) return cfg.ingresoPorMinutoPrivado;
  if (isSespa(value)) return cfg.ingresoPorMinutoSespa;
  return cfg.ingresoPorMinutoDefault;
}

function estimateReservationMargin(r: Reservation, cfg: EconomicConfig): { margin: number; minutes: number } {
  let ingresos = 0;
  let minutes = 0;
  let patients = 0;
  for (const p of r.patients ?? []) {
    if (p.scheduleStatus === "CANCELLED") continue;
    const base = p.estimatedDurationMinutes;
    if (typeof base !== "number" || !Number.isFinite(base) || base <= 0) continue;
    const total = base + TRANSITION_MINUTES_PER_PROCEDURE;
    ingresos += total * rateByInsurance(p.entidadFinanciadora, cfg);
    minutes += total;
    patients += 1;
  }
  const costs =
    minutes * cfg.costeQuirofanoPorMinuto +
    minutes * cfg.costePersonalPorMinuto +
    patients * cfg.costeVariablePorPaciente;
  return { margin: ingresos - costs, minutes };
}

function std(values: number[]): number | null {
  if (values.length === 0) return null;
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - avg) * (v - avg), 0) / values.length;
  return Math.sqrt(Math.max(0, variance));
}

export function analyzeBlockProfitability(input: AnalyzeBlockProfitabilityInput): BlockProfitabilityAnalysis {
  const activeReservations = input.reservations.filter((r) => r.status !== "cancelled" && r.status !== "released");
  const marginByReservationId = new Map<string, { margin: number; minutes: number }>();
  for (const r of activeReservations) marginByReservationId.set(r.id, estimateReservationMargin(r, input.economicConfig));

  const availableByTurn = new Map<string, number>();
  for (const s of input.slotViews) {
    if (s.status === "blocked") continue;
    const key = `${s.date}|${s.shift}`;
    availableByTurn.set(key, (availableByTurn.get(key) ?? 0) + (s.totalMinutes ?? 0));
  }

  const turnsMap = new Map<
    string,
    {
      date: string;
      shift: Shift;
      marginTotal: number;
      usedMinutes: number;
    }
  >();
  for (const r of activeReservations) {
    const k = `${r.date}|${r.shift}`;
    const m = marginByReservationId.get(r.id) ?? { margin: 0, minutes: 0 };
    const row = turnsMap.get(k) ?? {
      date: r.date,
      shift: r.shift,
      marginTotal: 0,
      usedMinutes: 0,
    };
    row.marginTotal += m.margin;
    row.usedMinutes += m.minutes;
    turnsMap.set(k, row);
  }
  const byTurn: ProfitabilityTurnRow[] = [...turnsMap.values()].map((t) => {
    const capacity = Math.max(1, availableByTurn.get(`${t.date}|${t.shift}`) ?? 1);
    const usedApprox = t.usedMinutes;
    return {
      date: t.date,
      shift: t.shift,
      marginTotal: t.marginTotal,
      marginPerMinute: t.usedMinutes > 0 ? t.marginTotal / t.usedMinutes : null,
      occupancy: Math.max(0, Math.min(1, usedApprox / capacity)),
      idleMinutes: Math.max(0, capacity - usedApprox),
      band: bandFromMargin(t.marginTotal),
    };
  });

  const roomMap = new Map<string, { margin: number; used: number; cap: number }>();
  for (const s of input.slotViews) {
    if (s.status === "blocked") continue;
    const room = roomMap.get(s.resourceId) ?? { margin: 0, used: 0, cap: 0 };
    room.cap += s.totalMinutes ?? 0;
    if (s.status === "occupied" && s.reservationId && marginByReservationId.has(s.reservationId)) {
      const m = marginByReservationId.get(s.reservationId)!;
      room.margin += m.margin;
      room.used += m.minutes;
    }
    roomMap.set(s.resourceId, room);
  }
  const totalUsed = Math.max(1, [...roomMap.values()].reduce((s, r) => s + r.used, 0));
  const byOperatingRoom = [...roomMap.entries()].map(([resourceId, v]) => ({
    resourceId,
    margin: v.margin,
    occupancy: v.cap > 0 ? Math.max(0, Math.min(1, v.used / v.cap)) : 0,
    dispersion: Math.max(0, 1 - v.used / totalUsed),
    band: bandFromMargin(v.margin),
  }));

  const surgeonNameById = new Map((input.usersDirectory ?? []).map((u) => [u.id, u.name]));
  const bySurgeonMap = new Map<string, { margins: number[]; durations: number[]; total: number; cancelled: number }>();
  for (const r of input.reservations) {
    const acc = bySurgeonMap.get(r.surgeonId) ?? { margins: [], durations: [], total: 0, cancelled: 0 };
    acc.total += 1;
    if (r.status === "cancelled") acc.cancelled += 1;
    if (r.status !== "cancelled" && r.status !== "released") {
      const m = marginByReservationId.get(r.id) ?? { margin: 0, minutes: 0 };
      acc.margins.push(m.margin);
      acc.durations.push(m.minutes);
    }
    bySurgeonMap.set(r.surgeonId, acc);
  }
  const bySurgeon = [...bySurgeonMap.entries()].map(([surgeonId, v]) => {
    const avgMargin = v.margins.length > 0 ? v.margins.reduce((s, x) => s + x, 0) / v.margins.length : null;
    const avgDuration = v.durations.length > 0 ? v.durations.reduce((s, x) => s + x, 0) / v.durations.length : null;
    return {
      surgeonId,
      surgeonName: surgeonNameById.get(surgeonId) ?? surgeonId,
      avgMargin,
      avgDuration,
      variability: std(v.durations),
      cancellationRate: v.total > 0 ? (v.cancelled / v.total) * 100 : 0,
      band: bandFromMargin(avgMargin ?? 0),
    };
  });

  const byProcedureMap = new Map<string, { margins: number[]; durations: number[] }>();
  for (const r of activeReservations) {
    for (const p of r.patients ?? []) {
      if (p.scheduleStatus === "CANCELLED") continue;
      const proc = (p.procedure ?? "").trim();
      if (!proc) continue;
      const d = (p.estimatedDurationMinutes ?? 0) + TRANSITION_MINUTES_PER_PROCEDURE;
      const margin = d * rateByInsurance(p.entidadFinanciadora, input.economicConfig) -
        d * input.economicConfig.costeQuirofanoPorMinuto -
        d * input.economicConfig.costePersonalPorMinuto -
        input.economicConfig.costeVariablePorPaciente;
      const acc = byProcedureMap.get(proc) ?? { margins: [], durations: [] };
      acc.margins.push(margin);
      acc.durations.push(d);
      byProcedureMap.set(proc, acc);
    }
  }
  const byProcedure = [...byProcedureMap.entries()].map(([procedure, v]) => {
    const avgMargin = v.margins.length > 0 ? v.margins.reduce((s, x) => s + x, 0) / v.margins.length : null;
    const avgDuration = v.durations.length > 0 ? v.durations.reduce((s, x) => s + x, 0) / v.durations.length : null;
    return {
      procedure,
      avgMargin,
      avgDuration,
      variability: std(v.durations),
      band: bandFromMargin(avgMargin ?? 0),
    };
  });

  const topLossSources: Array<{ source: string; margin: number }> = [];
  topLossSources.push(
    ...byTurn.map((t) => ({ source: `Turno ${t.date} ${t.shift === "morning" ? "mañana" : "tarde"}`, margin: t.marginTotal })),
    ...byOperatingRoom.map((r) => ({ source: `Quirófano ${r.resourceId}`, margin: r.margin })),
    ...byProcedure.map((p) => ({ source: `Procedimiento ${p.procedure}`, margin: p.avgMargin ?? 0 }))
  );
  topLossSources.sort((a, b) => a.margin - b.margin);

  return {
    byTurn: byTurn.sort((a, b) => b.marginTotal - a.marginTotal),
    byOperatingRoom: byOperatingRoom.sort((a, b) => b.margin - a.margin),
    bySurgeon: bySurgeon.sort((a, b) => (b.avgMargin ?? -Infinity) - (a.avgMargin ?? -Infinity)),
    byProcedure: byProcedure.sort((a, b) => (b.avgMargin ?? -Infinity) - (a.avgMargin ?? -Infinity)),
    topLossSources: topLossSources.slice(0, 3),
  };
}
