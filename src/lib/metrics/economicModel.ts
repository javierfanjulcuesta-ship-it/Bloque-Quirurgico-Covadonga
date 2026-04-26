/**
 * FASE 1 — Rentabilidad estimada (simulación cliente).
 * Parámetros numéricos vía `EconomicConfig` (por defecto `DEFAULT_ECONOMIC_CONFIG` en economicConfig.ts).
 */

import type { EconomicConfig } from "@/lib/metrics/economicConfig";
import { DEFAULT_ECONOMIC_CONFIG } from "@/lib/metrics/economicConfig";
import { TRANSITION_MINUTES_PER_PROCEDURE } from "@/lib/constants";
import { isPrivateFunding, isSespa } from "@/lib/patientInsurance";
import type { PatientInBlock, Reservation, ResourceId, Shift, SlotView } from "@/lib/types";
import { getSlotDurationMinutes } from "@/lib/utils";

export type { EconomicConfig } from "@/lib/metrics/economicConfig";
export { DEFAULT_ECONOMIC_CONFIG } from "@/lib/metrics/economicConfig";

export type EstadoRentabilidad = "rentable" | "ajustado" | "no_rentable";

export type TurnOpeningEstado =
  | "sin_actividad"
  | "rentable"
  | "dudoso"
  | "infrautilizado"
  | "no_rentable";

export interface TurnProfitabilityCell {
  date: string;
  resourceId: ResourceId;
  shift: Shift;
  ingresosTurno: number;
  minutosProgramados: number;
  pacientes: number;
  costeApertura: number;
  margenTurno: number;
  estado: TurnOpeningEstado;
}

export interface EconomicMetricsTotals {
  ingresosEstimados: number;
  costesEstimados: number;
  margenEstimado: number;
  margenPorMinutoProgramado: number | null;
  estadoRentabilidad: EstadoRentabilidad;
  /**
   * Minutos imputados solo en tramo base (occupied, sin isOverflowContinuation):
   * ingresos, coste quirófano marginal, coste personal y margen/min.
   */
  minutosOcupacion: number;
  /** Capacidad no bloqueada (informativo; no entra en costes del modelo marginal). */
  availableMinutes: number;
  pacientesContados: number;
}

export interface EconomicMetricsRow extends EconomicMetricsTotals {
  resourceId: ResourceId;
  resourceLabel: string;
  shift: Shift;
}

function slotCapMinutes(v: SlotView): number {
  if (v.totalMinutes != null && v.totalMinutes > 0) return v.totalMinutes;
  return getSlotDurationMinutes(v.shift, v.slotIndex);
}

/** Tarifa simulada €/min (misma lógica que rentabilidad marginal). */
export function ingresoPorMinutoDesdeSlot(
  v: Pick<SlotView, "hasPrivate" | "hasSespa">,
  cfg: EconomicConfig = DEFAULT_ECONOMIC_CONFIG
): number {
  if (v.hasPrivate) return cfg.ingresoPorMinutoPrivado;
  if (v.hasSespa) return cfg.ingresoPorMinutoSespa;
  return cfg.ingresoPorMinutoDefault;
}

export function estadoRentabilidadDesdeMargen(
  margen: number,
  cfg: EconomicConfig = DEFAULT_ECONOMIC_CONFIG
): EstadoRentabilidad {
  if (margen < 0) return "no_rentable";
  if (margen < cfg.umbralMargenAjustado) return "ajustado";
  return "rentable";
}

interface EconomicAcc {
  availableMinutes: number;
  programmedMinutes: number;
  ingresosEstimados: number;
  pacientesContados: number;
}

function emptyEconomicAcc(): EconomicAcc {
  return {
    availableMinutes: 0,
    programmedMinutes: 0,
    ingresosEstimados: 0,
    pacientesContados: 0,
  };
}

function patientIngresoRate(
  p: Pick<PatientInBlock, "entidadFinanciadora"> & { insuranceType?: string },
  cfg: EconomicConfig
): number {
  const funding = (p.entidadFinanciadora ?? p.insuranceType ?? "").trim();
  if (isPrivateFunding(funding)) return cfg.ingresoPorMinutoPrivado;
  if (isSespa(funding)) return cfg.ingresoPorMinutoSespa;
  return cfg.ingresoPorMinutoDefault;
}

function patientEconomicMinutes(p: Partial<PatientInBlock>): number {
  const m = p.estimatedDurationMinutes;
  if (typeof m !== "number" || !Number.isFinite(m) || m <= 0) return 0;
  return m + TRANSITION_MINUTES_PER_PROCEDURE;
}

function reservationIngresoEstimado(
  reservation: Pick<Reservation, "patients">,
  cfg: EconomicConfig
): number {
  // Ingresos por paciente para evitar sobreestimar bloques mixtos privado/SESPA.
  return (reservation.patients ?? []).reduce((sum, p) => {
    if (p.scheduleStatus === "CANCELLED") return sum;
    const minutes = patientEconomicMinutes(p);
    if (minutes <= 0) return sum;
    const rate = patientIngresoRate(p, cfg);
    return sum + minutes * rate;
  }, 0);
}

function buildReservationIngresosMap(
  reservations: Reservation[] | undefined,
  cfg: EconomicConfig
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of reservations ?? []) {
    out.set(r.id, reservationIngresoEstimado(r, cfg));
  }
  return out;
}

function ingresoDesdeSlot(
  v: SlotView,
  cfg: EconomicConfig,
  ingresosByReservationId: Map<string, number>,
  consumedReservationIds: Set<string>
): number {
  const rid = v.reservationId;
  if (rid && ingresosByReservationId.has(rid)) {
    if (consumedReservationIds.has(rid)) return 0;
    consumedReservationIds.add(rid);
    return ingresosByReservationId.get(rid) ?? 0;
  }
  const used = v.usedMinutes ?? 0;
  const rate = ingresoPorMinutoDesdeSlot(v, cfg);
  return used * rate;
}

function accumulateEconomicFromSlot(
  v: SlotView,
  acc: EconomicAcc,
  cfg: EconomicConfig,
  ingresosByReservationId: Map<string, number>,
  consumedReservationIds: Set<string>
): void {
  const cap = slotCapMinutes(v);
  if (v.status === "blocked") {
    return;
  }
  acc.availableMinutes += cap;

  if (v.status !== "occupied") {
    return;
  }

  const used = v.usedMinutes ?? 0;

  if (v.isOverflowContinuation) {
    return;
  }

  acc.ingresosEstimados += ingresoDesdeSlot(v, cfg, ingresosByReservationId, consumedReservationIds);
  acc.programmedMinutes += used;
  acc.pacientesContados += v.patientsCount ?? 0;
}

function finalizeEconomicAcc(acc: EconomicAcc, cfg: EconomicConfig): EconomicMetricsTotals {
  const minutosOcupacionBase = acc.programmedMinutes;

  // Modelo de rentabilidad marginal:
  // Solo se imputan costes sobre actividad real (minutos programados),
  // no sobre capacidad disponible. Esto permite analizar eficiencia operativa
  // sin contaminar con costes estructurales del turno.
  const costesEstimados =
    minutosOcupacionBase * cfg.costeQuirofanoPorMinuto +
    minutosOcupacionBase * cfg.costePersonalPorMinuto +
    acc.pacientesContados * cfg.costeVariablePorPaciente;

  const margenEstimado = acc.ingresosEstimados - costesEstimados;
  const margenPorMinutoProgramado =
    minutosOcupacionBase > 0 ? margenEstimado / minutosOcupacionBase : null;

  return {
    ingresosEstimados: acc.ingresosEstimados,
    costesEstimados,
    margenEstimado,
    margenPorMinutoProgramado,
    estadoRentabilidad: estadoRentabilidadDesdeMargen(margenEstimado, cfg),
    minutosOcupacion: minutosOcupacionBase,
    availableMinutes: acc.availableMinutes,
    pacientesContados: acc.pacientesContados,
  };
}

/** Agregado global de rentabilidad estimada a partir de `slotViews`. */
export function aggregateEconomicMetrics(
  slotViews: SlotView[],
  cfg: EconomicConfig = DEFAULT_ECONOMIC_CONFIG,
  reservations?: Reservation[]
): EconomicMetricsTotals {
  const acc = emptyEconomicAcc();
  const ingresosByReservationId = buildReservationIngresosMap(reservations, cfg);
  const consumedReservationIds = new Set<string>();
  for (const v of slotViews) {
    accumulateEconomicFromSlot(v, acc, cfg, ingresosByReservationId, consumedReservationIds);
  }
  return finalizeEconomicAcc(acc, cfg);
}

/** Desglose por recurso y turno (mismo universo que la tabla operativa). */
export function breakdownEconomicByResourceAndShift(
  slotViews: SlotView[],
  resources: { id: ResourceId; label: string }[],
  cfg: EconomicConfig = DEFAULT_ECONOMIC_CONFIG,
  reservations?: Reservation[]
): EconomicMetricsRow[] {
  const rows: EconomicMetricsRow[] = [];
  const ingresosByReservationId = buildReservationIngresosMap(reservations, cfg);
  const shifts: Shift[] = ["morning", "afternoon"];
  for (const r of resources) {
    for (const shift of shifts) {
      const acc = emptyEconomicAcc();
      const consumedReservationIds = new Set<string>();
      for (const v of slotViews) {
        if (v.resourceId !== r.id || v.shift !== shift) continue;
        accumulateEconomicFromSlot(v, acc, cfg, ingresosByReservationId, consumedReservationIds);
      }
      const totals = finalizeEconomicAcc(acc, cfg);
      rows.push({
        resourceId: r.id,
        resourceLabel: r.label,
        shift,
        ...totals,
      });
    }
  }
  return rows;
}

export function profitabilityTurnKey(date: string, resourceId: ResourceId, shift: Shift): string {
  return `${date}|${resourceId}|${shift}`;
}

type TurnAgg = { ingresosTurno: number; minutosProgramados: number; pacientes: number };

/**
 * Mapa (date, recurso, turno) → rentabilidad estimada de apertura con coste fijo por turno si hay actividad.
 * Ingresos y minutos solo en huecos base ocupados (sin continuación de overflow).
 */
export function buildTurnProfitabilityMap(
  slotViews: SlotView[],
  resourceIds: ResourceId[],
  weekDates: string[],
  cfg: EconomicConfig = DEFAULT_ECONOMIC_CONFIG,
  reservations?: Reservation[]
): Map<string, TurnProfitabilityCell> {
  const raw = new Map<string, TurnAgg>();
  const ingresosByReservationId = buildReservationIngresosMap(reservations, cfg);
  const consumedReservationIds = new Set<string>();
  for (const v of slotViews) {
    if (v.status !== "occupied" || v.isOverflowContinuation) continue;
    const key = profitabilityTurnKey(v.date, v.resourceId, v.shift);
    const used = v.usedMinutes ?? 0;
    const ingreso = ingresoDesdeSlot(v, cfg, ingresosByReservationId, consumedReservationIds);
    let acc = raw.get(key);
    if (!acc) {
      acc = { ingresosTurno: 0, minutosProgramados: 0, pacientes: 0 };
      raw.set(key, acc);
    }
    acc.ingresosTurno += ingreso;
    acc.minutosProgramados += used;
    acc.pacientes += v.patientsCount ?? 0;
  }

  const shifts: Shift[] = ["morning", "afternoon"];
  const out = new Map<string, TurnProfitabilityCell>();

  for (const date of weekDates) {
    for (const resourceId of resourceIds) {
      for (const shift of shifts) {
        const key = profitabilityTurnKey(date, resourceId, shift);
        const acc = raw.get(key) ?? { ingresosTurno: 0, minutosProgramados: 0, pacientes: 0 };
        const hayActividad = acc.pacientes > 0 || acc.minutosProgramados > 0;
        const costeApertura = hayActividad ? cfg.costeAperturaTurnoDefault : 0;
        const margenTurno = acc.ingresosTurno - costeApertura;

        const minProg = acc.minutosProgramados;
        let estado: TurnOpeningEstado;
        if (!hayActividad) {
          estado = "sin_actividad";
        } else if (margenTurno < cfg.umbralNoRentable) {
          estado = "no_rentable";
        } else if (margenTurno >= cfg.umbralRentable && minProg >= cfg.umbralMinutosRentableMapa) {
          estado = "rentable";
        } else if (margenTurno >= 0 && minProg < cfg.umbralMinutosRentableMapa) {
          estado = "infrautilizado";
        } else {
          estado = "dudoso";
        }

        out.set(key, {
          date,
          resourceId,
          shift,
          ingresosTurno: acc.ingresosTurno,
          minutosProgramados: acc.minutosProgramados,
          pacientes: acc.pacientes,
          costeApertura,
          margenTurno: hayActividad ? margenTurno : 0,
          estado,
        });
      }
    }
  }

  return out;
}
