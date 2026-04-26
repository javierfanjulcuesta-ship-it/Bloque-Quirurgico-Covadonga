/**
 * FASE 1 — Rentabilidad estimada (simulación cliente).
 * Supuestos temporales; no es facturación real.
 */

import type { ResourceId, Shift, SlotView } from "@/lib/types";
import { getSlotDurationMinutes } from "@/lib/utils";

// --- Constantes temporales (editables en fases posteriores) ---
export const ingresoPorMinutoDefault = 18;
export const ingresoPorMinutoPrivado = 30;
export const ingresoPorMinutoSespa = 12;
export const costeQuirofanoPorMinuto = 8;
export const costePersonalPorMinuto = 6;
export const costeVariablePorPaciente = 120;
export const umbralMargenAjustado = 300;

export type EstadoRentabilidad = "rentable" | "ajustado" | "no_rentable";

export interface EconomicMetricsTotals {
  ingresosEstimados: number;
  costesEstimados: number;
  margenEstimado: number;
  margenPorMinutoProgramado: number | null;
  estadoRentabilidad: EstadoRentabilidad;
  /** Minutos imputados solo en tramo base (sin continuaciones de desborde): ingresos, coste personal y €/min. */
  minutosOcupacion: number;
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

function ingresoPorMinutoSlot(v: SlotView): number {
  if (v.hasPrivate) return ingresoPorMinutoPrivado;
  if (v.hasSespa) return ingresoPorMinutoSespa;
  return ingresoPorMinutoDefault;
}

export function estadoRentabilidadDesdeMargen(margen: number): EstadoRentabilidad {
  if (margen < 0) return "no_rentable";
  if (margen < umbralMargenAjustado) return "ajustado";
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

function accumulateEconomicFromSlot(v: SlotView, acc: EconomicAcc): void {
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

  const rate = ingresoPorMinutoSlot(v);
  acc.ingresosEstimados += used * rate;
  acc.programmedMinutes += used;
  acc.pacientesContados += v.patientsCount ?? 0;
}

function finalizeEconomicAcc(acc: EconomicAcc): EconomicMetricsTotals {
  const minutosOcupacionBase = acc.programmedMinutes;
  const costesEstimados =
    acc.availableMinutes * costeQuirofanoPorMinuto +
    minutosOcupacionBase * costePersonalPorMinuto +
    acc.pacientesContados * costeVariablePorPaciente;

  const margenEstimado = acc.ingresosEstimados - costesEstimados;
  const margenPorMinutoProgramado =
    minutosOcupacionBase > 0 ? margenEstimado / minutosOcupacionBase : null;

  return {
    ingresosEstimados: acc.ingresosEstimados,
    costesEstimados,
    margenEstimado,
    margenPorMinutoProgramado,
    estadoRentabilidad: estadoRentabilidadDesdeMargen(margenEstimado),
    minutosOcupacion: minutosOcupacionBase,
    availableMinutes: acc.availableMinutes,
    pacientesContados: acc.pacientesContados,
  };
}

/** Agregado global de rentabilidad estimada a partir de `slotViews`. */
export function aggregateEconomicMetrics(slotViews: SlotView[]): EconomicMetricsTotals {
  const acc = emptyEconomicAcc();
  for (const v of slotViews) {
    accumulateEconomicFromSlot(v, acc);
  }
  return finalizeEconomicAcc(acc);
}

/** Desglose por recurso y turno (mismo universo que la tabla operativa). */
export function breakdownEconomicByResourceAndShift(
  slotViews: SlotView[],
  resources: { id: ResourceId; label: string }[]
): EconomicMetricsRow[] {
  const rows: EconomicMetricsRow[] = [];
  const shifts: Shift[] = ["morning", "afternoon"];
  for (const r of resources) {
    for (const shift of shifts) {
      const acc = emptyEconomicAcc();
      for (const v of slotViews) {
        if (v.resourceId !== r.id || v.shift !== shift) continue;
        accumulateEconomicFromSlot(v, acc);
      }
      const totals = finalizeEconomicAcc(acc);
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
