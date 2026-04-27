import { TRANSITION_MINUTES_PER_PROCEDURE } from "@/lib/constants";
import type { EconomicConfig } from "@/lib/metrics/economicConfig";
import { isPrivateFunding, isSespa } from "@/lib/patientInsurance";
import type { Reservation, SlotView, User } from "@/lib/types";

export interface SurgeonDynamicsInput {
  reservations: Reservation[];
  slotViews: SlotView[];
  economicConfig: EconomicConfig;
  usersDirectory?: User[];
}

export interface SurgeonDynamicsRow {
  surgeonId: string;
  surgeonName: string;
  numeroReservas: number;
  numeroPacientes: number;
  minutosProgramados: number;
  margenEstimado: number | null;
  antelacionMediaDias: number | null;
  porcentajeProgramadoMenos7Dias: number | null;
  porcentajeProgramadoMenos48h: number | null;
  cancelacionesReservas: number;
  tasaCancelacion: number;
  reservasLiberadas: number;
  reservasSinPacientes: number;
  duracionMedia: number | null;
  variabilidadDuracion: number | null;
  procedimientosFrecuentes: string[];
  quirofanosUtilizados: number;
}

function patientMinutesForEconomics(r: Reservation): number {
  return (r.patients ?? []).reduce((sum, p) => {
    if (p.scheduleStatus === "CANCELLED") return sum;
    const m = p.estimatedDurationMinutes;
    if (typeof m !== "number" || !Number.isFinite(m) || m <= 0) return sum;
    return sum + m + TRANSITION_MINUTES_PER_PROCEDURE;
  }, 0);
}

function ingresoRateByPatientInsurance(insurance: string | undefined, cfg: EconomicConfig): number {
  const funding = (insurance ?? "").trim();
  if (isPrivateFunding(funding)) return cfg.ingresoPorMinutoPrivado;
  if (isSespa(funding)) return cfg.ingresoPorMinutoSespa;
  return cfg.ingresoPorMinutoDefault;
}

function estimatedReservationMargin(r: Reservation, cfg: EconomicConfig): number {
  let ingresos = 0;
  let pacientes = 0;
  let minutos = 0;
  for (const p of r.patients ?? []) {
    if (p.scheduleStatus === "CANCELLED") continue;
    const m = p.estimatedDurationMinutes;
    if (typeof m !== "number" || !Number.isFinite(m) || m <= 0) continue;
    const totalPatientMinutes = m + TRANSITION_MINUTES_PER_PROCEDURE;
    ingresos += totalPatientMinutes * ingresoRateByPatientInsurance(p.entidadFinanciadora, cfg);
    minutos += totalPatientMinutes;
    pacientes += 1;
  }
  const costes =
    minutos * cfg.costeQuirofanoPorMinuto +
    minutos * cfg.costePersonalPorMinuto +
    pacientes * cfg.costeVariablePorPaciente;
  return ingresos - costes;
}

function parseLeadDays(createdAt: string | undefined, dateIso: string): number | null {
  if (!createdAt) return null;
  const created = new Date(createdAt);
  const surgery = new Date(`${dateIso}T00:00:00.000Z`);
  if (!Number.isFinite(created.getTime()) || !Number.isFinite(surgery.getTime())) return null;
  const diffMs = surgery.getTime() - created.getTime();
  return diffMs / (24 * 60 * 60 * 1000);
}

function stdDev(values: number[]): number | null {
  if (values.length === 0) return null;
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - avg) * (v - avg), 0) / values.length;
  return Math.sqrt(Math.max(0, variance));
}

export function analyzeSurgeonDynamics(input: SurgeonDynamicsInput): SurgeonDynamicsRow[] {
  const nameById = new Map((input.usersDirectory ?? []).map((u) => [u.id, u.name]));
  const bySurgeon = new Map<string, Reservation[]>();
  for (const r of input.reservations ?? []) {
    const list = bySurgeon.get(r.surgeonId) ?? [];
    list.push(r);
    bySurgeon.set(r.surgeonId, list);
  }

  const rows: SurgeonDynamicsRow[] = [];
  for (const [surgeonId, surgeonReservations] of bySurgeon) {
    const numeroReservas = surgeonReservations.length;
    const canceladas = surgeonReservations.filter((r) => r.status === "cancelled").length;
    const liberadas = surgeonReservations.filter((r) => r.status === "released").length;
    const reservasSinPacientes = surgeonReservations.filter((r) => (r.patients?.length ?? 0) === 0).length;
    const numeroPacientes = surgeonReservations.reduce((s, r) => s + (r.patients?.filter((p) => p.scheduleStatus !== "CANCELLED").length ?? 0), 0);
    const activeReservations = surgeonReservations.filter((r) => r.status !== "cancelled" && r.status !== "released");
    const reservationDurations = activeReservations
      .map((r) => patientMinutesForEconomics(r))
      .filter((m) => m > 0);
    const minutosProgramados = reservationDurations.reduce((s, m) => s + m, 0);

    const leadDays = surgeonReservations
      .map((r) => parseLeadDays(r.createdAt, r.date))
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const antelacionMediaDias = leadDays.length > 0 ? leadDays.reduce((s, v) => s + v, 0) / leadDays.length : null;
    const porcentajeProgramadoMenos7Dias =
      leadDays.length > 0 ? (leadDays.filter((d) => d < 7).length / leadDays.length) * 100 : null;
    const porcentajeProgramadoMenos48h =
      leadDays.length > 0 ? (leadDays.filter((d) => d < 2).length / leadDays.length) * 100 : null;

    const marginSamples = activeReservations
      .filter((r) => (r.patients?.length ?? 0) > 0)
      .map((r) => estimatedReservationMargin(r, input.economicConfig));
    const margenEstimado = marginSamples.length > 0 ? marginSamples.reduce((s, v) => s + v, 0) : null;

    const duracionMedia =
      reservationDurations.length > 0 ? reservationDurations.reduce((s, m) => s + m, 0) / reservationDurations.length : null;
    const variabilidadDuracion = stdDev(reservationDurations);

    const procedures = new Map<string, number>();
    for (const r of surgeonReservations) {
      for (const p of r.patients ?? []) {
        if (p.scheduleStatus === "CANCELLED") continue;
        const label = (p.procedure ?? "").trim();
        if (!label) continue;
        procedures.set(label, (procedures.get(label) ?? 0) + 1);
      }
    }
    const procedimientosFrecuentes = [...procedures.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);

    const activeRoomSet = new Set(
      surgeonReservations
        .filter((r) => r.status !== "cancelled" && r.status !== "released")
        .map((r) => r.resourceId)
    );

    rows.push({
      surgeonId,
      surgeonName: nameById.get(surgeonId) ?? surgeonId,
      numeroReservas,
      numeroPacientes,
      minutosProgramados,
      margenEstimado,
      antelacionMediaDias,
      porcentajeProgramadoMenos7Dias,
      porcentajeProgramadoMenos48h,
      cancelacionesReservas: canceladas,
      tasaCancelacion: numeroReservas > 0 ? (canceladas / numeroReservas) * 100 : 0,
      reservasLiberadas: liberadas,
      reservasSinPacientes,
      duracionMedia,
      variabilidadDuracion,
      procedimientosFrecuentes,
      quirofanosUtilizados: activeRoomSet.size,
    });
  }

  rows.sort((a, b) => b.minutosProgramados - a.minutosProgramados);
  return rows;
}
