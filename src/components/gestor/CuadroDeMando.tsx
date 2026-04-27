"use client";

// FUTURO: listados de reservas en el cuadro pueden usar `getDisplaySurgeonName` desde `@/lib/surgeonTitular`.

import { Fragment, useMemo, useRef, useState } from "react";
import {
  ASSIGNMENT_FULL_SHIFT,
  type AnesthetistAssignment,
  type PatientInBlock,
  type Reservation,
  type ResourceId,
  type Shift,
  type SlotView,
  type User,
} from "@/lib/types";
import { isPrivateFunding, isSespa } from "@/lib/patientInsurance";
import { QUIRUFANO_IDS } from "@/lib/constants";
import { getEffectiveTotalMinutes, getSlots, getWeekDays, getWeekStart, toISODate } from "@/lib/utils";
import {
  aggregateOperatingRoomMetrics,
  breakdownByResourceAndShift,
  type OperatingRoomMetricsTotals,
} from "@/lib/metrics/operatingRoomMetrics";
import {
  DEFAULT_ECONOMIC_CONFIG,
  economicConfigsEqual,
  parseEconomicConfigFromXlsx,
  type EconomicConfig,
} from "@/lib/metrics/economicConfig";
import {
  aggregateEconomicMetrics,
  breakdownEconomicByResourceAndShift,
  buildTurnProfitabilityMap,
  profitabilityTurnKey,
  type EconomicMetricsRow,
  type EconomicMetricsTotals,
  type EstadoRentabilidad,
  type TurnOpeningEstado,
  type TurnProfitabilityCell,
} from "@/lib/metrics/economicModel";
import {
  analyzeTemporalLoad,
  computeBlockOptimization,
  optimizeBlockIteratively,
  simulateBlockConfigurations,
} from "@/lib/metrics/optimizationEngine";
import { analyzeSurgeonDynamics } from "@/lib/metrics/surgeonDynamics";

export interface CuadroDeMandoProps {
  slotViews: SlotView[];
  weekStart: Date;
  /** Sincroniza la semana con el calendario (mismo `weekStart` y periodo de carga en la página). */
  onWeekStartChange?: (weekStartMonday: Date) => void;
  lastReservationsFetchedAt: Date | null;
  resources: { id: ResourceId; label: string }[];
  /** Reservas del periodo cargado (se filtra por semana de `weekStart` en el análisis de anestesia). */
  reservations?: Reservation[];
  /** Asignaciones OR del periodo; si falta, se usa `reservation.anesthetistId` como respaldo. */
  anesthetistAssignments?: AnesthetistAssignment[];
  /** Directorio de usuarios para el nombre del anestesista. */
  usersDirectory?: User[];
}

type AnesthetistEfficiencyRow = {
  anesthetistId: string;
  anesthetistLabel: string;
  date: string;
  shift: Shift;
  shiftTurnLabel: string;
  minutosOcupados: number;
  numeroQuirofanosCubiertos: number;
  numeroBloques: number;
  tieneSolapes: boolean;
};

function reservationEligibleForEfficiency(r: Reservation): boolean {
  return r.status !== "cancelled" && r.status !== "released" && (r.patients?.length ?? 0) > 0;
}

function coveredResourceIdsForAssignment(
  a: AnesthetistAssignment,
  resources: { id: ResourceId }[]
): ResourceId[] {
  if (a.resourceId === ASSIGNMENT_FULL_SHIFT) return resources.map((r) => r.id);
  return [a.resourceId as ResourceId];
}

function baseUsedMinutesForReservation(res: Reservation, slotViews: SlotView[]): number {
  const v = slotViews.find(
    (s) =>
      s.reservationId === res.id &&
      s.date === res.date &&
      s.shift === res.shift &&
      s.resourceId === res.resourceId &&
      s.status === "occupied" &&
      !s.isOverflowContinuation
  );
  if (v?.usedMinutes != null) return v.usedMinutes;
  return getEffectiveTotalMinutes(res.patients ?? []);
}

/** Minutos desde el inicio del turno hasta el fin del bloque (aprox., mismo día y turno). */
function intervalWithinShift(res: Reservation): { start: number; end: number } {
  const slots = getSlots(res.shift);
  let start = 0;
  for (let i = 0; i < res.slotIndex && i < slots.length; i++) {
    start += slots[i]!.durationMinutes;
  }
  const end = start + Math.max(0, getEffectiveTotalMinutes(res.patients ?? []));
  return { start, end };
}

function intervalsOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

function hasAnyPairwiseOverlap(intervals: { start: number; end: number }[]): boolean {
  for (let i = 0; i < intervals.length; i++) {
    for (let j = i + 1; j < intervals.length; j++) {
      if (intervalsOverlap(intervals[i]!, intervals[j]!)) return true;
    }
  }
  return false;
}

function buildAnesthetistEfficiencyRows(
  weekStart: Date,
  slotViews: SlotView[],
  reservations: Reservation[],
  assignments: AnesthetistAssignment[],
  resources: { id: ResourceId; label: string }[],
  users: User[]
): AnesthetistEfficiencyRow[] {
  const weekDays = getWeekDays(weekStart);
  const weekIso = new Set(weekDays.map((d) => toISODate(d)));
  const inWeek = reservations.filter((r) => weekIso.has(r.date) && reservationEligibleForEfficiency(r));

  const resToAnesthetist = new Map<string, string>();
  for (const a of assignments) {
    if (a.assignmentType !== "OR" || !weekIso.has(a.date)) continue;
    const covered = coveredResourceIdsForAssignment(a, resources);
    for (const res of inWeek) {
      if (res.date !== a.date || res.shift !== a.shift) continue;
      if (!covered.includes(res.resourceId)) continue;
      resToAnesthetist.set(res.id, a.anesthetistId);
    }
  }
  for (const res of inWeek) {
    if (!resToAnesthetist.has(res.id) && res.anesthetistId) {
      resToAnesthetist.set(res.id, res.anesthetistId);
    }
  }

  type GroupAgg = {
    anesthetistId: string;
    date: string;
    shift: Shift;
    reservationIds: Set<string>;
    minutosOcupados: number;
    resourceIds: Set<ResourceId>;
  };
  const groups = new Map<string, GroupAgg>();

  for (const res of inWeek) {
    const aid = resToAnesthetist.get(res.id);
    if (!aid) continue;
    const key = `${aid}|${res.date}|${res.shift}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        anesthetistId: aid,
        date: res.date,
        shift: res.shift,
        reservationIds: new Set(),
        minutosOcupados: 0,
        resourceIds: new Set(),
      };
      groups.set(key, g);
    }
    g.reservationIds.add(res.id);
    g.minutosOcupados += baseUsedMinutesForReservation(res, slotViews);
    g.resourceIds.add(res.resourceId);
  }

  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? id;

  const rows: AnesthetistEfficiencyRow[] = [];
  for (const g of groups.values()) {
    const ress = inWeek.filter((r) => {
      const aid = resToAnesthetist.get(r.id);
      return aid === g.anesthetistId && r.date === g.date && r.shift === g.shift;
    });
    const intervals = ress.map((r) => intervalWithinShift(r));
    const tieneSolapes = hasAnyPairwiseOverlap(intervals);
    const shiftTurnLabel = `${g.date} · ${g.shift === "morning" ? "Mañana" : "Tarde"}`;
    rows.push({
      anesthetistId: g.anesthetistId,
      anesthetistLabel: nameOf(g.anesthetistId),
      date: g.date,
      shift: g.shift,
      shiftTurnLabel,
      minutosOcupados: Math.round(g.minutosOcupados),
      numeroQuirofanosCubiertos: g.resourceIds.size,
      numeroBloques: g.reservationIds.size,
      tieneSolapes,
    });
  }

  rows.sort((a, b) => {
    const c = a.date.localeCompare(b.date);
    if (c !== 0) return c;
    if (a.shift !== b.shift) return a.shift === "morning" ? -1 : 1;
    return a.anesthetistLabel.localeCompare(b.anesthetistLabel, "es");
  });
  return rows;
}

function anesthesiaEfficiencyRowClass(row: AnesthetistEfficiencyRow): string {
  if (row.tieneSolapes) return "bg-rose-50/80";
  if (row.minutosOcupados < 60) return "bg-amber-50/80";
  return "bg-emerald-50/80";
}

function formatMinutes(n: number): string {
  return `${Math.round(n)} min`;
}

function formatPercent(p: number | null): string {
  if (p == null) return "—";
  return `${p.toFixed(1)} %`;
}

function formatRatio(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

function structuralConfidenceBadge(level: "alta" | "media" | "baja"): {
  label: string;
  className: string;
} {
  if (level === "alta") {
    return {
      label: "Alta confianza",
      className: "border-emerald-200 bg-emerald-100 text-emerald-900",
    };
  }
  if (level === "media") {
    return {
      label: "Media confianza",
      className: "border-amber-200 bg-amber-100 text-amber-950",
    };
  }
  return {
    label: "Baja confianza",
    className: "border-rose-200 bg-rose-100 text-rose-900",
  };
}

function confidenceFactor(level: RecommendationConfidenceLevel): number {
  if (level === "alta") return 1.0;
  if (level === "media") return 0.7;
  return 0.4;
}

function executiveReasonByCategory(category: UnifiedRecommendation["category"]): string {
  if (category === "estructural") return "Actividad dispersa en demasiados quirófanos";
  if (category === "personal_franja") return "Pico de carga detectado";
  if (category === "reagrupar_actividad") return "Margen bajo con baja ocupación";
  return "Oportunidad operativa detectada";
}

const eurFmt = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const eurFmtDecimals = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatEur(n: number): string {
  return eurFmt.format(Math.round(n));
}

function formatEurMin(n: number | null): string {
  if (n == null) return "—";
  return eurFmtDecimals.format(n);
}

function estadoRentabilidadLabel(e: EstadoRentabilidad): string {
  if (e === "rentable") return "Rentable";
  if (e === "ajustado") return "Ajustado";
  return "No rentable";
}

function rowClassesEstado(e: EstadoRentabilidad): string {
  if (e === "rentable") return "bg-emerald-50/80";
  if (e === "ajustado") return "bg-amber-50/80";
  return "bg-rose-50/80";
}

function badgeEstadoClasses(e: EstadoRentabilidad): string {
  if (e === "rentable") return "border-emerald-200 bg-emerald-100 text-emerald-900";
  if (e === "ajustado") return "border-amber-200 bg-amber-100 text-amber-950";
  return "border-rose-200 bg-rose-100 text-rose-900";
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--ribera-navy)]">{value}</p>
    </div>
  );
}

function EconomicSummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "warning" | "negative";
}) {
  const border =
    tone === "positive"
      ? "border-emerald-200"
      : tone === "warning"
        ? "border-amber-200"
        : tone === "negative"
          ? "border-rose-200"
          : "border-slate-200";
  const bg =
    tone === "positive"
      ? "bg-emerald-50/90"
      : tone === "warning"
        ? "bg-amber-50/90"
        : tone === "negative"
          ? "bg-rose-50/90"
          : "bg-slate-50/80";
  const text =
    tone === "positive"
      ? "text-emerald-900"
      : tone === "warning"
        ? "text-amber-950"
        : tone === "negative"
          ? "text-rose-900"
          : "text-[var(--ribera-navy)]";
  return (
    <div className={`rounded-lg border px-3 py-2 shadow-sm ${border} ${bg}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold tabular-nums ${text}`}>{value}</p>
    </div>
  );
}

/** Pacientes en reservas de la semana visible: programados vs cancelados/anulados (reserva liberada o paciente CANCELLED). */
function weekReservationPatientCounts(
  reservations: Reservation[],
  weekDateSet: Set<string>
): { programados: number; canceladosOAnulados: number } {
  let programados = 0;
  let canceladosOAnulados = 0;
  for (const r of reservations) {
    if (!weekDateSet.has(r.date)) continue;
    if (r.status === "cancelled" || r.status === "released") {
      canceladosOAnulados += r.patients?.length ?? 0;
      continue;
    }
    for (const p of r.patients ?? []) {
      if (p.scheduleStatus === "CANCELLED") canceladosOAnulados += 1;
      else programados += 1;
    }
  }
  return { programados, canceladosOAnulados };
}

function metricsCards(t: OperatingRoomMetricsTotals) {
  return [
    { label: "Disponible", value: formatMinutes(t.availableMinutes) },
    { label: "Programado", value: formatMinutes(t.programmedMinutes) },
    { label: "Reserva vacía", value: formatMinutes(t.reservedEmptyMinutes) },
    { label: "Hueco libre", value: formatMinutes(t.freeSlotMinutes) },
    { label: "Libre intrabloque", value: formatMinutes(t.intraBlockFreeMinutes) },
    { label: "Desborde", value: formatMinutes(t.overflowMinutes) },
    { label: "Ocupación", value: formatPercent(t.occupancyPercent) },
  ];
}

const shiftLabel: Record<string, string> = { morning: "Mañana", afternoon: "Tarde" };

function turnMapHalfCellClasses(estado: TurnOpeningEstado): string {
  if (estado === "sin_actividad") return "border-slate-200 bg-slate-50 text-slate-500";
  if (estado === "rentable") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (estado === "dudoso" || estado === "infrautilizado") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-rose-200 bg-rose-50 text-rose-800";
}

type ConfianzaEstimada = "alta" | "media" | "baja";
type OccupancyBand = "alta" | "media" | "baja" | "sin_actividad";
type RecommendationConfidenceLevel = "alta" | "media" | "baja";

type UnifiedRecommendation = {
  title: string;
  action: string;
  mainReason: string;
  description: string;
  impactEuro: number;
  confidenceLevel: RecommendationConfidenceLevel;
  confidenceFactor: number;
  impactWeighted: number;
  category: "estructural" | "personal_franja" | "reagrupar_actividad" | "otras";
};

type DashboardInternalTab =
  | "resumen"
  | "recomendaciones"
  | "mapa-economico"
  | "bloque-abierto"
  | "personal"
  | "dinamica-quirurgica"
  | "metricas";

type TurnStrategicReading = {
  ocupacionTurno: number;
  occupancyBand: OccupancyBand;
  lecturaCombinada: string;
  recomendacion: string;
};

function patientFundingBucket(p: Pick<PatientInBlock, "entidadFinanciadora" | "scheduleStatus">): string | null {
  if (p.scheduleStatus === "CANCELLED") return null;
  const f = (p.entidadFinanciadora ?? "").trim();
  if (!f) return null;
  if (isPrivateFunding(f)) return "privado";
  if (isSespa(f)) return "sespa";
  return "otro";
}

/**
 * Mezcla de financiaciones en el mismo turno (recurso + día + mañana/tarde): más de un tipo entre privado, SESPA u otro.
 * Solo lectura de `slotViews` y `reservations`; no altera métricas económicas.
 */
function buildTurnMixedFundingByKey(
  slotViews: SlotView[],
  reservations: Reservation[],
  weekDateSet: Set<string>
): Map<string, boolean> {
  const resById = new Map(reservations.map((r) => [r.id, r]));
  const bucketsByKey = new Map<string, Set<string>>();

  const ensureBuckets = (key: string): Set<string> => {
    let s = bucketsByKey.get(key);
    if (!s) {
      s = new Set();
      bucketsByKey.set(key, s);
    }
    return s;
  };

  for (const v of slotViews) {
    if (v.status !== "occupied" || v.isOverflowContinuation) continue;
    if (!weekDateSet.has(v.date)) continue;
    const key = profitabilityTurnKey(v.date, v.resourceId, v.shift);
    const set = ensureBuckets(key);
    if (v.reservationId) {
      const res = resById.get(v.reservationId);
      let anyPatientBucket = false;
      for (const p of res?.patients ?? []) {
        const b = patientFundingBucket(p);
        if (b) {
          set.add(b);
          anyPatientBucket = true;
        }
      }
      if (!anyPatientBucket) {
        if (v.hasPrivate) set.add("privado");
        if (v.hasSespa) set.add("sespa");
      }
    } else {
      if (v.hasPrivate) set.add("privado");
      if (v.hasSespa) set.add("sespa");
    }
  }

  const out = new Map<string, boolean>();
  for (const [key, set] of bucketsByKey) {
    out.set(key, set.size >= 2);
  }
  return out;
}

/** Prioridad: baja (poca muestra o mezcla) → alta (margen y minutos) → media (banda de margen) → baja. */
function turnCellConfidence(cell: TurnProfitabilityCell, mixedFunding: boolean): ConfianzaEstimada {
  const min = cell.minutosProgramados;
  const m = cell.margenTurno;
  if (min < 120 || mixedFunding) return "baja";
  if (m >= 300 && min >= 120) return "alta";
  if (m >= -200 && m <= 300) return "media";
  return "baja";
}

function confianzaEstimadaLabel(c: ConfianzaEstimada): string {
  if (c === "alta") return "alta";
  if (c === "media") return "media";
  return "baja";
}

function confianzaCeldaSuffix(c: ConfianzaEstimada): string {
  if (c === "alta") return "alta";
  if (c === "media") return "media";
  return "baja";
}

function turnCellDecisionFull(cell: TurnProfitabilityCell, cfg: EconomicConfig): string {
  if (cell.estado === "sin_actividad") return "Revisar por baja actividad";
  if (cell.estado === "infrautilizado") return "Reagrupar actividad";
  if (cell.estado === "rentable") return "Mantener abierto";
  if (cell.estado === "no_rentable") {
    if (cell.margenTurno <= cfg.umbralNoRentable - 300) return "Probable cierre";
    return "Revisar continuidad";
  }
  if (cell.margenTurno < 0) return "Revisar coste y agenda";
  return "Mantener y monitorizar";
}

function turnCellDecisionShort(cell: TurnProfitabilityCell, cfg: EconomicConfig): string {
  if (cell.estado === "sin_actividad") return "Sin actividad";
  if (cell.estado === "infrautilizado") return "Reagrupar";
  if (cell.estado === "rentable") return "Mantener";
  if (cell.estado === "no_rentable") {
    if (cell.margenTurno <= cfg.umbralNoRentable - 300) return "Revisar";
    return "Revisar";
  }
  if (cell.margenTurno < 0) return "Revisar";
  return "Mantener";
}

function turnCellStatusLabel(cell: TurnProfitabilityCell, cfg: EconomicConfig): string {
  if (cell.estado === "sin_actividad") return "Sin actividad";
  if (cell.estado === "infrautilizado") return "Margen positivo con baja carga";
  if (cell.estado === "rentable") return "Rentable y con carga suficiente";
  if (cell.estado === "no_rentable") {
    if (cell.margenTurno <= cfg.umbralNoRentable - 300) return "Déficit claro";
    return "Déficit leve";
  }
  return cell.margenTurno < 0 ? "Riesgo económico" : "Margen ajustado";
}

function turnCellConfidenceReason(
  cell: TurnProfitabilityCell,
  mixedFunding: boolean,
  confidence: ConfianzaEstimada
): string | null {
  if (confidence === "baja") {
    const lowMinutes = cell.minutosProgramados < 120;
    if (lowMinutes && mixedFunding) return "ambos";
    if (lowMinutes) return "menos de 120 min programados";
    if (mixedFunding) return "mezcla de financiaciones";
    return "menos de 120 min programados";
  }
  if (confidence === "media") return "margen en banda intermedia (-200 a 300)";
  return null;
}

function expectedShiftMinutes(shift: Shift): number {
  return getSlots(shift).reduce((sum, s) => sum + s.durationMinutes, 0);
}

/** Quirófanos principales (Q1–Q3) presentes en la lista de recursos del cuadro. */
function mainOperatingRoomIds(resources: { id: ResourceId }[]): ResourceId[] {
  const allowed = new Set<ResourceId>(QUIRUFANO_IDS);
  return resources.map((r) => r.id).filter((id) => allowed.has(id));
}

/**
 * Parámetros de la capa interpretativa «anestesia laboral vs mercantil» en lectura por bloque (Q1–Q3).
 * No forma parte del modelo económico principal (`buildTurnProfitabilityMap`, `aggregateEconomicMetrics`, etc.).
 *
 * Limitaciones (solo capacidad de decisión, no contabilidad):
 * - No se modelan complejidad del caso, número de anestesistas simultáneos, tiempos muertos intra-turno,
 *   ni mínimos reales de mercado para mercantiles.
 * - Sustituye únicamente una fracción hipotética del coste (anestesia) frente a ingresos agregados del bloque;
 *   no incluye enfermería, TCAE, coste de apertura por sala del mapa, ni condiciones contractuales reales.
 * - `costeTurnoLaboralAnestesia` se aplica una sola vez por bloque (día + turno), no por quirófano, alineado con
 *   «no se puede contratar medio turno» a nivel de bloque abierto.
 */
const ANESTHESIA_BLOCK_SCENARIO_PARAMS: {
  costeTurnoLaboralAnestesia: number;
  porcentajeMercantilAnestesia: number;
  /** Umbral mínimo de ingresos del bloque para considerar viable el escenario mercantil; `null` desactiva la regla. */
  ingresoMinimoMercantil: number | null;
  /** Diferencia mínima (€) entre saldos simulados para considerar «mejora clara» a favor del mercantil. */
  umbralMejoraMercantilEur: number;
} = {
  costeTurnoLaboralAnestesia: 500,
  porcentajeMercantilAnestesia: 0.2,
  ingresoMinimoMercantil: 400,
  umbralMejoraMercantilEur: 50,
};

/** Ingresos de bloque donde coste fijo laboral = coste mercantil proporcional (solo modelo anestesia). */
const ANESTHESIA_EQUILIBRIO_LABORAL_MERCANTIL_TOOLTIP =
  "Por debajo de este ingreso, el coste mercantil porcentual es menor que el fijo laboral; por encima, el fijo laboral puede ser más eficiente.";

function computePuntoEquilibrioMercantilVsLaboralIngresos(
  p: typeof ANESTHESIA_BLOCK_SCENARIO_PARAMS
): number | null {
  const pct = p.porcentajeMercantilAnestesia;
  if (!(pct > 0) || !Number.isFinite(pct) || !Number.isFinite(p.costeTurnoLaboralAnestesia)) return null;
  const v = p.costeTurnoLaboralAnestesia / pct;
  return Number.isFinite(v) && v > 0 ? v : null;
}

type BlockAnesthesiaScenarioReading = {
  ingresosTotalesTurno: number;
  margenActualBloque: number;
  costeAnestesiaLaboral: number;
  costeAnestesiaMercantil: number;
  /** Ingresos del bloque menos solo el coste hipotético de anestesia laboral (no es margen económico completo). */
  saldoTrasAnestesiaLaboral: number;
  /** Ingresos del bloque menos solo el coste hipotético de anestesia mercantil (no es margen económico completo). */
  saldoTrasAnestesiaMercantil: number;
  mercantilNoViable: boolean;
  /** saldo mercantil − saldo laboral; null si el escenario mercantil se marca como no viable. */
  diferenciaPorModeloAnestesia: number | null;
  /** Ingresos del bloque en los que coinciden coste fijo laboral y coste % mercantil; `null` si el % es inválido. */
  puntoEquilibrioMercantilVsLaboral: number | null;
  recomendacionAnestesia: string;
};

function computeBlockAnesthesiaScenarioReading(
  ingresosTotalesTurno: number,
  margenActualBloque: number
): BlockAnesthesiaScenarioReading {
  const p = ANESTHESIA_BLOCK_SCENARIO_PARAMS;
  const puntoEquilibrioMercantilVsLaboral = computePuntoEquilibrioMercantilVsLaboralIngresos(p);
  const costeAnestesiaLaboral = p.costeTurnoLaboralAnestesia;
  const costeAnestesiaMercantil = ingresosTotalesTurno * p.porcentajeMercantilAnestesia;
  const saldoTrasAnestesiaLaboral = ingresosTotalesTurno - costeAnestesiaLaboral;
  const saldoTrasAnestesiaMercantil = ingresosTotalesTurno - costeAnestesiaMercantil;
  const mercantilNoViable =
    p.ingresoMinimoMercantil != null && ingresosTotalesTurno < p.ingresoMinimoMercantil;

  let recomendacionAnestesia: string;
  if (mercantilNoViable) {
    recomendacionAnestesia = "Modelo anestesia: actividad insuficiente para opción mercantil";
  } else if (saldoTrasAnestesiaMercantil > saldoTrasAnestesiaLaboral + p.umbralMejoraMercantilEur) {
    recomendacionAnestesia = "Modelo anestesia: mercantil potencialmente más eficiente";
  } else {
    recomendacionAnestesia = "Modelo anestesia: laboral más adecuado para este nivel de actividad";
  }

  const diferenciaPorModeloAnestesia = mercantilNoViable
    ? null
    : saldoTrasAnestesiaMercantil - saldoTrasAnestesiaLaboral;

  return {
    ingresosTotalesTurno,
    margenActualBloque,
    costeAnestesiaLaboral,
    costeAnestesiaMercantil,
    saldoTrasAnestesiaLaboral,
    saldoTrasAnestesiaMercantil,
    mercantilNoViable,
    diferenciaPorModeloAnestesia,
    puntoEquilibrioMercantilVsLaboral,
    recomendacionAnestesia,
  };
}

function formatSignedEurDelta(n: number): string {
  const abs = formatEur(Math.abs(n)).replace("−", "-");
  if (n > 0) return `+${abs}`;
  if (n < 0) return `-${abs}`;
  return formatEur(0);
}

function blockOpenRecommendation(margenAgregado: number, ocupacionGlobal: number, minutosProgramadosTotales: number): string {
  if (minutosProgramadosTotales <= 0 || ocupacionGlobal === 0) {
    return "No programar salvo necesidad estratégica";
  }
  if (ocupacionGlobal >= 0.8 && margenAgregado > 0) return "Bloque bien aprovechado";
  if (ocupacionGlobal < 0.5 && margenAgregado > 0) return "Completar actividad o reagrupar";
  if (ocupacionGlobal >= 0.8 && margenAgregado <= 0) return "Revisar cartera/tarifas/costes";
  if (ocupacionGlobal < 0.5 && margenAgregado <= 0) return "Evitar apertura futura o concentrar actividad";
  if (margenAgregado > 0) return "Completar actividad o reagrupar";
  return "Revisar cartera/tarifas/costes o concentrar actividad";
}

function getTurnStrategicReading(cell: TurnProfitabilityCell, minutosDisponiblesTurno: number): TurnStrategicReading {
  const ocupacionTurno =
    minutosDisponiblesTurno > 0 ? Math.max(0, Math.min(1, cell.minutosProgramados / minutosDisponiblesTurno)) : 0;
  const occupancyBand: OccupancyBand =
    ocupacionTurno === 0 ? "sin_actividad" : ocupacionTurno >= 0.8 ? "alta" : ocupacionTurno >= 0.5 ? "media" : "baja";

  const econLabel =
    cell.estado === "rentable"
      ? "rentable"
      : cell.estado === "no_rentable"
        ? "no rentable"
        : cell.estado === "sin_actividad"
          ? "sin actividad"
          : "dudoso";
  const occLabel =
    occupancyBand === "alta"
      ? "ocupación alta"
      : occupancyBand === "media"
        ? "ocupación media"
        : occupancyBand === "baja"
          ? "ocupación baja"
          : "sin actividad";

  let recomendacion = "Revisar";
  if (cell.estado === "sin_actividad" || occupancyBand === "sin_actividad") {
    recomendacion = "No programar salvo necesidad estratégica";
  } else if (cell.estado === "rentable" && occupancyBand === "alta") {
    recomendacion = "Mantener y priorizar";
  } else if (cell.estado === "rentable" && occupancyBand === "media") {
    recomendacion = "Mantener y completar huecos";
  } else if (cell.estado === "rentable" && occupancyBand === "baja") {
    recomendacion = "Reagrupar actividad rentable";
  } else if ((cell.estado === "dudoso" || cell.estado === "infrautilizado") && occupancyBand === "alta") {
    recomendacion = "Revisar tarifas o costes";
  } else if ((cell.estado === "dudoso" || cell.estado === "infrautilizado") && occupancyBand === "media") {
    recomendacion = "Optimizar programación";
  } else if ((cell.estado === "dudoso" || cell.estado === "infrautilizado") && occupancyBand === "baja") {
    recomendacion = "Reagrupar";
  } else if (cell.estado === "no_rentable" && occupancyBand === "alta") {
    recomendacion = "Problema estructural";
  } else if (cell.estado === "no_rentable" && occupancyBand === "media") {
    recomendacion = "Revisar o reagrupar";
  } else if (cell.estado === "no_rentable" && occupancyBand === "baja") {
    recomendacion = "Reagrupar o no abrir en futuros turnos";
  }

  return {
    ocupacionTurno,
    occupancyBand,
    lecturaCombinada: `${econLabel} con ${occLabel}`,
    recomendacion,
  };
}

function turnMapTooltip(
  cell: TurnProfitabilityCell,
  cfg: EconomicConfig,
  mixedFunding: boolean,
  minutosDisponiblesTurno: number
): string {
  const minP = Math.round(cell.minutosProgramados);
  const shift = cell.shift === "morning" ? "Mañana" : "Tarde";
  const estadoLabel = turnCellStatusLabel(cell, cfg);
  const decision = turnCellDecisionFull(cell, cfg);
  const confidence = turnCellConfidence(cell, mixedFunding);
  const conf = confianzaEstimadaLabel(confidence);
  const reason = turnCellConfidenceReason(cell, mixedFunding, confidence);
  const strategic = getTurnStrategicReading(cell, minutosDisponiblesTurno);
  const ocupacionPct = `${(strategic.ocupacionTurno * 100).toFixed(0)}%`;
  const confidenceLine =
    confidence === "baja"
      ? "Confianza estimada: baja. La recomendación requiere revisión manual."
      : `Confianza estimada: ${conf}.`;
  const reasonLine = reason ? ` Motivo: ${reason}.` : "";
  const bloqueNota =
    "Nota: La decisión real puede depender del bloque completo abierto, no solo de una sala aislada.";
  return `Turno: ${shift} · Estado: ${estadoLabel} · Acción sugerida: ${decision} · Ingresos estimados: ${formatEur(cell.ingresosTurno)} · Coste apertura estimado: ${formatEur(cell.costeApertura)} · Margen: ${formatEur(cell.margenTurno)} · Min. programados: ${minP} · Pacientes: ${cell.pacientes}. Ocupación: ${ocupacionPct}. Lectura combinada: ${strategic.lecturaCombinada}. Recomendación estratégica: ${strategic.recomendacion}. ${bloqueNota} ${confidenceLine}${reasonLine} Modelo estimado no contable.`;
}

function TurnMapHalfCell({
  cell,
  economicConfig,
  mixedFunding,
  minutosDisponiblesTurno,
}: {
  cell: TurnProfitabilityCell;
  economicConfig: EconomicConfig;
  mixedFunding: boolean;
  minutosDisponiblesTurno: number;
}) {
  const marginText =
    cell.estado === "sin_actividad"
      ? "—"
      : `${cell.margenTurno >= 0 ? "+" : ""}${formatEur(cell.margenTurno).replace("−", "-")}`;
  const decisionText = turnCellDecisionShort(cell, economicConfig);
  const conf = turnCellConfidence(cell, mixedFunding);
  const secondLine = `${decisionText} · ${confianzaCeldaSuffix(conf)}`;
  return (
    <div
      title={turnMapTooltip(cell, economicConfig, mixedFunding, minutosDisponiblesTurno)}
      className={`flex h-12 flex-col items-center justify-center rounded-lg border px-2 text-center sm:h-14 ${turnMapHalfCellClasses(cell.estado)}`}
    >
      <span className="text-sm font-semibold tabular-nums">{marginText}</span>
      <span className="text-[10px] font-medium leading-tight opacity-90">{secondLine}</span>
    </div>
  );
}

export function CuadroDeMando({
  slotViews,
  weekStart,
  onWeekStartChange,
  lastReservationsFetchedAt,
  resources,
  reservations = [],
  anesthetistAssignments = [],
  usersDirectory = [],
}: CuadroDeMandoProps) {
  const [activeDashboardTab, setActiveDashboardTab] = useState<DashboardInternalTab>("resumen");
  const [economicConfig, setEconomicConfig] = useState<EconomicConfig>(() => ({ ...DEFAULT_ECONOMIC_CONFIG }));
  const [economicImportError, setEconomicImportError] = useState<string | null>(null);
  const economicFileInputRef = useRef<HTMLInputElement>(null);

  const isCustomEconomicConfig = useMemo(
    () => !economicConfigsEqual(economicConfig, DEFAULT_ECONOMIC_CONFIG),
    [economicConfig]
  );

  const totals = useMemo(() => aggregateOperatingRoomMetrics(slotViews), [slotViews, weekStart]);
  const rows = useMemo(
    () => breakdownByResourceAndShift(slotViews, resources),
    [slotViews, resources, weekStart]
  );

  /**
   * Agregado marginal semanal del modelo económico actual.
   * `slotViews` se construye en la página del calendario acotado a la semana visible (`weekStart`) y recursos;
   * al cambiar programación, reservas, `economicConfig` o semana, este `useMemo` (y mapa/bloque que dependen de ello) se recalcula.
   */
  const economicTotals = useMemo(
    () => aggregateEconomicMetrics(slotViews, economicConfig, reservations),
    [slotViews, economicConfig, reservations, weekStart]
  );
  const economicRows = useMemo(
    () => breakdownEconomicByResourceAndShift(slotViews, resources, economicConfig, reservations),
    [slotViews, resources, economicConfig, reservations, weekStart]
  );

  const economicCardTone = (t: EconomicMetricsTotals): "positive" | "warning" | "negative" | "neutral" => {
    if (t.estadoRentabilidad === "rentable") return "positive";
    if (t.estadoRentabilidad === "ajustado") return "warning";
    if (t.estadoRentabilidad === "no_rentable") return "negative";
    return "neutral";
  };

  /** Ocupación % del mismo universo que ingresos/costes marginales (minutos base / capacidad no bloqueada). */
  const weeklyOccupancyEconomicPct = useMemo(() => {
    if (economicTotals.availableMinutes <= 0) return null;
    return (economicTotals.minutosOcupacion / economicTotals.availableMinutes) * 100;
  }, [economicTotals]);

  const weeklyBalanceMarginVisual = useMemo(() => {
    const e = economicTotals.estadoRentabilidad;
    if (e === "rentable") {
      return { border: "border-emerald-300 bg-emerald-50/95", text: "text-emerald-900" };
    }
    if (e === "ajustado") {
      return { border: "border-amber-300 bg-amber-50/95", text: "text-amber-950" };
    }
    if (e === "no_rentable") {
      return { border: "border-rose-300 bg-rose-50/95", text: "text-rose-900" };
    }
    return { border: "border-slate-200 bg-slate-50/90", text: "text-[var(--ribera-navy)]" };
  }, [economicTotals]);

  const anesthetistEfficiencyRows = useMemo(
    () =>
      buildAnesthetistEfficiencyRows(
        weekStart,
        slotViews,
        reservations,
        anesthetistAssignments,
        resources,
        usersDirectory
      ),
    [weekStart, slotViews, reservations, anesthetistAssignments, resources, usersDirectory]
  );

  const weekDatesIso = useMemo(() => getWeekDays(weekStart).map((d) => toISODate(d)), [weekStart]);
  const weekDayColumns = useMemo(() => {
    const days = getWeekDays(weekStart);
    return days.map((d) => ({
      iso: toISODate(d),
      label: d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" }),
    }));
  }, [weekStart]);

  const turnProfitabilityMap = useMemo(
    () =>
      buildTurnProfitabilityMap(
        slotViews,
        resources.map((r) => r.id),
        weekDatesIso,
        economicConfig,
        reservations
      ),
    [slotViews, resources, weekDatesIso, economicConfig, reservations, weekStart]
  );

  const weekDateSet = useMemo(() => new Set(weekDatesIso), [weekDatesIso]);

  const weekPatientStats = useMemo(
    () => weekReservationPatientCounts(reservations, weekDateSet),
    [reservations, weekDateSet]
  );

  const turnMixedFundingByKey = useMemo(
    () => buildTurnMixedFundingByKey(slotViews, reservations, weekDateSet),
    [slotViews, reservations, weekDateSet]
  );

  const turnAvailableMinutesByKey = useMemo(() => {
    const morningExpected = expectedShiftMinutes("morning");
    const afternoonExpected = expectedShiftMinutes("afternoon");
    const out = new Map<string, number>();
    for (const date of weekDatesIso) {
      for (const r of resources) {
        // Capa estratégica: usamos capacidad teórica estándar del turno (agenda base),
        // no slots visibles, para no sesgar ocupación por filtros, carga parcial o slots faltantes.
        // Limitación: no refleja cierres extraordinarios ni capacidad contractual específica por recurso.
        out.set(profitabilityTurnKey(date, r.id, "morning"), morningExpected);
        out.set(profitabilityTurnKey(date, r.id, "afternoon"), afternoonExpected);
      }
    }
    return out;
  }, [weekDatesIso, resources]);

  const strategicExecutiveStats = useMemo(() => {
    let rentablesBienOcupados = 0;
    let rentablesInfrautilizados = 0;
    let llenosPocoRentables = 0;
    let vaciosCandidatosCierre = 0;

    for (const c of turnProfitabilityMap.values()) {
      const key = profitabilityTurnKey(c.date, c.resourceId, c.shift);
      const strategic = getTurnStrategicReading(c, turnAvailableMinutesByKey.get(key) ?? 0);
      const isDudosoONoRentable =
        c.estado === "dudoso" || c.estado === "infrautilizado" || c.estado === "no_rentable";
      if (c.estado === "rentable" && strategic.occupancyBand === "alta") rentablesBienOcupados += 1;
      if (c.estado === "rentable" && (strategic.occupancyBand === "media" || strategic.occupancyBand === "baja")) {
        rentablesInfrautilizados += 1;
      }
      if (strategic.occupancyBand === "alta" && isDudosoONoRentable) llenosPocoRentables += 1;
      if (c.estado === "sin_actividad" || (c.estado === "no_rentable" && strategic.occupancyBand === "baja")) {
        vaciosCandidatosCierre += 1;
      }
    }

    return { rentablesBienOcupados, rentablesInfrautilizados, llenosPocoRentables, vaciosCandidatosCierre };
  }, [turnProfitabilityMap, turnAvailableMinutesByKey, weekStart]);

  const lecturaBloqueAbiertoRows = useMemo(() => {
    const orIds = mainOperatingRoomIds(resources);
    if (orIds.length === 0) return [];
    const shifts: Shift[] = ["morning", "afternoon"];
    const rows: {
      date: string;
      shift: Shift;
      qConActividad: number;
      minutosProgramadosTotales: number;
      capacidadTotalMinutos: number;
      ocupacionGlobal: number;
      margenAgregado: number;
      ingresosTotalesTurno: number;
      anestesia: BlockAnesthesiaScenarioReading;
      optimization: ReturnType<typeof computeBlockOptimization>;
      recommendationSimulation: string;
      recomendacion: string;
    }[] = [];

    for (const date of weekDatesIso) {
      for (const shift of shifts) {
        let qConActividad = 0;
        let minutosProgramadosTotales = 0;
        let capacidadTotalMinutos = 0;
        let margenAgregado = 0;
        let ingresosTotalesTurno = 0;
        for (const id of orIds) {
          const key = profitabilityTurnKey(date, id, shift);
          const cell = turnProfitabilityMap.get(key);
          if (!cell) continue;
          if (cell.estado !== "sin_actividad") qConActividad += 1;
          minutosProgramadosTotales += cell.minutosProgramados;
          margenAgregado += cell.margenTurno;
          ingresosTotalesTurno += cell.ingresosTurno;
          capacidadTotalMinutos += turnAvailableMinutesByKey.get(key) ?? expectedShiftMinutes(shift);
        }
        const ocupacionGlobal =
          capacidadTotalMinutos > 0 ? Math.max(0, Math.min(1, minutosProgramadosTotales / capacidadTotalMinutos)) : 0;
        const anestesia = computeBlockAnesthesiaScenarioReading(ingresosTotalesTurno, margenAgregado);
        const optimization = computeBlockOptimization({
          date,
          shift,
          reservations,
          assignments: anesthetistAssignments,
          operatingRoomIds: orIds,
          ingresosTurno: ingresosTotalesTurno,
          margenTurno: margenAgregado,
          ocupacionGlobal,
          totalOperatingRoomsInBlock: orIds.length,
        });
        const recommendationSimulation =
          `Movimiento recomendado: simultaneidad ${formatRatio(Math.max(0, optimization.simultaneidad - 0.2))} -> ${formatRatio(optimization.simultaneidad)}. ` +
          `Nivel de solapamiento ${Math.max(0, Math.round((optimization.nivelSolapamiento - 0.03) * 100))}% -> ${Math.round(optimization.nivelSolapamiento * 100)}%. ` +
          `Impacto margen estimado +${Math.round(Math.max(0, optimization.eficienciaSolapamiento) * 1450)} EUR. ` +
          (optimization.mejoraEficienciaAnestesia
            ? "Mejora eficiencia de anestesia compartida."
            : "Sin mejora clara de eficiencia de anestesia.");
        rows.push({
          date,
          shift,
          qConActividad,
          minutosProgramadosTotales,
          capacidadTotalMinutos,
          ocupacionGlobal,
          margenAgregado,
          ingresosTotalesTurno,
          anestesia,
          optimization,
          recommendationSimulation,
          recomendacion: blockOpenRecommendation(margenAgregado, ocupacionGlobal, minutosProgramadosTotales),
        });
      }
    }
    return rows;
  }, [resources, weekDatesIso, turnProfitabilityMap, turnAvailableMinutesByKey, weekStart]);

  const structuralOptimizationRows = useMemo(() => {
    const orIds = mainOperatingRoomIds(resources);
    if (orIds.length === 0) return [];
    return lecturaBloqueAbiertoRows.map((row) => {
      const capacidadPorQuirofano = row.shift === "morning" ? expectedShiftMinutes("morning") : expectedShiftMinutes("afternoon");
      const structuralInput = {
        date: row.date,
        shift: row.shift,
        reservations,
        assignments: anesthetistAssignments,
        operatingRoomIds: orIds,
        ingresosActuales: row.ingresosTotalesTurno,
        margenActual: row.margenAgregado,
        minutosProgramadosActuales: row.minutosProgramadosTotales,
        capacidadPorQuirofano,
      };
      const simulation = simulateBlockConfigurations(structuralInput);
      const iterative = optimizeBlockIteratively(structuralInput);
      return {
        date: row.date,
        shift: row.shift,
        simulation,
        iterative,
      };
    });
  }, [resources, lecturaBloqueAbiertoRows, reservations, anesthetistAssignments]);

  const structuralExecutive = useMemo(() => {
    let mejoraTotal = 0;
    let bloquesConMejora = 0;
    for (const row of structuralOptimizationRows) {
      if (row.simulation.marginDeltaOptimalVsCurrent > 0) {
        bloquesConMejora += 1;
        mejoraTotal += row.simulation.marginDeltaOptimalVsCurrent;
      }
    }
    return { mejoraTotal, bloquesConMejora };
  }, [structuralOptimizationRows]);

  const temporalLoadRows = useMemo(() => {
    const orIds = mainOperatingRoomIds(resources);
    if (orIds.length === 0) return [];
    return lecturaBloqueAbiertoRows.map((row) => {
      const analysis = analyzeTemporalLoad({
        date: row.date,
        shift: row.shift,
        reservations,
        assignments: anesthetistAssignments,
        operatingRoomIds: orIds,
      });
      return { date: row.date, shift: row.shift, analysis };
    });
  }, [resources, lecturaBloqueAbiertoRows, reservations, anesthetistAssignments]);

  const unifiedRecommendations = useMemo(() => {
    const items: UnifiedRecommendation[] = [];

    for (const row of structuralOptimizationRows) {
      const level = row.iterative.confidenceLevel as RecommendationConfidenceLevel;
      const factor = confidenceFactor(level);
      const impactEuro = Math.max(0, row.simulation.marginDeltaOptimalVsCurrent);
      // Priorización (no impacto real): penaliza más recomendaciones de baja confianza.
      const impactWeighted = impactEuro * factor * factor;
      items.push({
        title: `Optimización estructural (${row.date} · ${row.shift === "morning" ? "Mañana" : "Tarde"})`,
        action: `Reducir actividad a ${row.simulation.optimal.openedOperatingRooms} quirófanos`,
        mainReason: executiveReasonByCategory("estructural"),
        description: row.simulation.recommendation,
        impactEuro,
        confidenceLevel: level,
        confidenceFactor: factor,
        impactWeighted,
        category: "estructural",
      });
    }

    for (const row of temporalLoadRows) {
      const level: RecommendationConfidenceLevel = row.analysis.hasStaffDeficit
        ? "media"
        : row.analysis.hasPeak
          ? "media"
          : "baja";
      const factor = confidenceFactor(level);
      const impactEuro = row.analysis.hasPeak ? (row.analysis.estimatedImpact.evitaAperturaExtra ? 600 : 250) : 100;
      const impactWeighted = impactEuro * factor * factor;
      items.push({
        title: `Personal por franja (${row.date} · ${row.shift === "morning" ? "Mañana" : "Tarde"})`,
        action: row.analysis.hasPeak
          ? `Añadir refuerzo de enfermería ${row.analysis.peakRangeLabel ?? "en franja pico"}`
          : "Mantener dotación actual",
        mainReason: executiveReasonByCategory("personal_franja"),
        description: row.analysis.recommendation,
        impactEuro,
        confidenceLevel: level,
        confidenceFactor: factor,
        impactWeighted,
        category: "personal_franja",
      });
    }

    for (const c of turnProfitabilityMap.values()) {
      if (c.estado !== "infrautilizado") continue;
      const level: RecommendationConfidenceLevel = "media";
      const factor = confidenceFactor(level);
      const impactEuro = Math.max(0, c.margenTurno * 0.2);
      const impactWeighted = impactEuro * factor * factor;
      items.push({
        title: `Reagrupar actividad (${c.date} · ${c.shift === "morning" ? "Mañana" : "Tarde"})`,
        action: "Reagrupar actividad infrautilizada",
        mainReason: executiveReasonByCategory("reagrupar_actividad"),
        description: `Turno infrautilizado en ${c.resourceId}. Reagrupar puede mejorar densidad operativa sin cambios automáticos.`,
        impactEuro,
        confidenceLevel: level,
        confidenceFactor: factor,
        impactWeighted,
        category: "reagrupar_actividad",
      });
    }

    items.sort((a, b) => b.impactWeighted - a.impactWeighted);
    return items;
  }, [structuralOptimizationRows, temporalLoadRows, turnProfitabilityMap]);

  const groupedUnifiedRecommendations = useMemo(() => {
    const top = unifiedRecommendations.slice(0, 3);
    const rest = unifiedRecommendations.slice(3);
    const medio = rest.filter((r) => r.impactWeighted >= 300);
    const bajo = rest.filter((r) => r.impactWeighted < 300);
    return { top, medio, bajo };
  }, [unifiedRecommendations]);

  const surgeonDynamicsRows = useMemo(
    () => analyzeSurgeonDynamics({ reservations, slotViews, economicConfig, usersDirectory }),
    [reservations, slotViews, economicConfig, usersDirectory]
  );

  const surgeonDynamicsHighlights = useMemo(() => {
    const byActivity = surgeonDynamicsRows[0] ?? null;
    const byLead = [...surgeonDynamicsRows]
      .filter((r) => r.antelacionMediaDias != null)
      .sort((a, b) => (b.antelacionMediaDias ?? 0) - (a.antelacionMediaDias ?? 0))[0] ?? null;
    const byCancel = [...surgeonDynamicsRows].sort((a, b) => b.tasaCancelacion - a.tasaCancelacion)[0] ?? null;
    const byVar = [...surgeonDynamicsRows]
      .filter((r) => r.variabilidadDuracion != null)
      .sort((a, b) => (b.variabilidadDuracion ?? 0) - (a.variabilidadDuracion ?? 0))[0] ?? null;
    return { byActivity, byLead, byCancel, byVar };
  }, [surgeonDynamicsRows]);

  const mapExecutiveStats = useMemo(() => {
    const labelById = new Map(resources.map((r) => [r.id, r.label]));
    const grouped = {
      cerrarProbable: [] as string[],
      reagrupar: [] as string[],
      mantener: [] as string[],
      revisar: [] as string[],
      bajaActividad: [] as string[],
    };
    const counts = {
      cerrarProbable: 0,
      reagrupar: 0,
      mantener: 0,
      revisar: 0,
      bajaActividad: 0,
    };
    let margenMantenerTotal = 0;
    let decisionesBajaConfianza = 0;

    for (const c of turnProfitabilityMap.values()) {
      const turnKey = profitabilityTurnKey(c.date, c.resourceId, c.shift);
      if (turnCellConfidence(c, turnMixedFundingByKey.get(turnKey) ?? false) === "baja") {
        decisionesBajaConfianza += 1;
      }
      const lab = labelById.get(c.resourceId) ?? c.resourceId;
      const turno = c.shift === "morning" ? "M" : "T";
      const prefix = `${lab} · ${c.date} (${turno})`;
      if (c.estado === "sin_actividad") {
        counts.bajaActividad += 1;
        grouped.bajaActividad.push(prefix);
      } else if (c.estado === "rentable") {
        counts.mantener += 1;
        margenMantenerTotal += Math.max(0, c.margenTurno);
        grouped.mantener.push(`${prefix}: ${formatEur(c.margenTurno)}`);
      } else if (c.estado === "infrautilizado") {
        counts.reagrupar += 1;
        grouped.reagrupar.push(`${prefix}: ${Math.round(c.minutosProgramados)} min`);
      } else if (c.estado === "no_rentable" && c.margenTurno <= economicConfig.umbralNoRentable - 300) {
        counts.cerrarProbable += 1;
        grouped.cerrarProbable.push(`${prefix}: ${formatEur(c.margenTurno)}`);
      } else {
        counts.revisar += 1;
        grouped.revisar.push(`${prefix}: ${formatEur(c.margenTurno)}`);
      }
    }

    return { grouped, counts, margenMantenerTotal, decisionesBajaConfianza };
  }, [turnProfitabilityMap, resources, economicConfig.umbralNoRentable, turnMixedFundingByKey, weekStart]);

  const weekRangeLabel = useMemo(() => {
    const days = getWeekDays(weekStart);
    const from = days[0]!;
    const to = days[days.length - 1]!;
    const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
    return `${from.toLocaleDateString("es-ES", opts)} – ${to.toLocaleDateString("es-ES", {
      ...opts,
      year: "numeric",
    })}`;
  }, [weekStart]);

  const updatedAt =
    lastReservationsFetchedAt?.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    }) ?? null;

  const isCurrentCalendarWeek = useMemo(
    () => toISODate(getWeekStart(weekStart)) === toISODate(getWeekStart(new Date())),
    [weekStart]
  );

  const shiftWeek = (deltaWeeks: number) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7 * deltaWeeks);
    onWeekStartChange?.(getWeekStart(d));
  };

  const goToCurrentWeek = () => onWeekStartChange?.(getWeekStart(new Date()));

  return (
    <section className="space-y-8">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-bold tracking-tight text-[var(--ribera-navy)]">Cuadro de mando</h2>
        <p className="mt-1 text-sm text-slate-600">Seguimiento operativo y económico semanal del bloque quirúrgico.</p>
        <p className="mt-1 text-xs text-slate-500">
          El cuadro de mando está organizado por decisión: resumen, recomendaciones, mapa económico, bloque abierto,
          personal y métricas.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { id: "resumen", label: "Resumen" },
            { id: "recomendaciones", label: "Recomendaciones" },
            { id: "mapa-economico", label: "Mapa económico" },
            { id: "bloque-abierto", label: "Bloque abierto" },
            { id: "personal", label: "Personal" },
            { id: "dinamica-quirurgica", label: "Dinámica quirúrgica" },
            { id: "metricas", label: "Métricas" },
          ].map((tab) => {
            const active = activeDashboardTab === (tab.id as DashboardInternalTab);
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveDashboardTab(tab.id as DashboardInternalTab)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  active
                    ? "border-[var(--ribera-navy)] bg-[var(--ribera-navy)] text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 sm:shadow-md">
        {activeDashboardTab === "resumen" && (
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50/90 to-white px-4 py-5 shadow-sm sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-bold tracking-tight text-[var(--ribera-navy)]">Balance estimado de actividad semanal</h3>
              <p className="mt-1 text-sm text-slate-600">Modelo marginal según programación actual</p>
              <p className="mt-1 text-xs text-slate-500">
                <span className="font-medium text-slate-700">{weekRangeLabel}</span> · Lunes{" "}
                <span className="font-medium text-slate-700">{toISODate(weekStart)}</span>
                {updatedAt ? (
                  <>
                    {" "}
                    · Actualizado <span className="font-medium text-slate-600">{updatedAt}</span>
                  </>
                ) : null}
              </p>
              <p className="mt-2 text-[11px] text-slate-500">
                Se actualiza automáticamente al cambiar programación, anulaciones, ampliaciones o pacientes.
              </p>
              <details className="mt-2 rounded-lg border border-slate-200 bg-white/80 px-3 py-2">
                <summary className="cursor-pointer text-xs font-semibold text-slate-700">Supuestos y limitaciones del balance</summary>
                <div className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-slate-600">
                  <p>Modelo estimativo; no incluye todos los costes reales ni facturación definitiva.</p>
                  <p>No representa margen neto contable ni coste completo del bloque.</p>
                  <p>Mismo agregado marginal que la tabla «Rentabilidad marginal» de esta página.</p>
                </div>
              </details>
            </div>
            <div
              className={`w-full shrink-0 rounded-xl border px-4 py-3 shadow-sm sm:min-w-[220px] sm:max-w-sm lg:w-auto ${weeklyBalanceMarginVisual.border}`}
            >
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Margen marginal estimado</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums sm:text-3xl ${weeklyBalanceMarginVisual.text}`}>
                {formatEur(economicTotals.margenEstimado)}
              </p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Ingresos estimados</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{formatEur(economicTotals.ingresosEstimados)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Costes estimados</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{formatEur(economicTotals.costesEstimados)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Pacientes programados</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{weekPatientStats.programados}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Cancelados / anulados</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{weekPatientStats.canceladosOAnulados}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Minutos programados</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
                {formatMinutes(economicTotals.minutosOcupacion)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Ocupación media estimada</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
                {weeklyOccupancyEconomicPct != null ? `${weeklyOccupancyEconomicPct.toFixed(1)} %` : "—"}
              </p>
            </div>
          </div>
        </div>
        )}

        {activeDashboardTab === "mapa-economico" && (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-lg font-bold tracking-tight text-[var(--ribera-navy)]">Mapa de rentabilidad de turnos</h3>
            <p className="mt-1 text-sm text-slate-700">
              Vista semanal: qué turnos mantener, reagrupar o revisar.
            </p>
            <details className="mt-2 rounded-lg border border-amber-200/80 bg-amber-50/50 px-3 py-2">
              <summary className="cursor-pointer text-xs font-semibold text-amber-950">
                Bloque completo vs sala aislada
              </summary>
              <p className="mt-2 text-xs leading-relaxed text-amber-950/90">
                La decisión real puede depender del bloque completo abierto, no solo de una sala aislada.
              </p>
            </details>
          </div>
          <div className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <p className="font-semibold text-slate-700">Turnos</p>
            <p>M = Mañana</p>
            <p>T = Tarde</p>
          </div>
        </div>
        )}

        {activeDashboardTab === "mapa-economico" && onWeekStartChange ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => shiftWeek(-1)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Semana anterior
            </button>
            <button
              type="button"
              onClick={goToCurrentWeek}
              disabled={isCurrentCalendarWeek}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Semana actual
            </button>
            <button
              type="button"
              onClick={() => shiftWeek(1)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Semana siguiente
            </button>
          </div>
        ) : null}

        {activeDashboardTab === "mapa-economico" && (
        <details className="rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold text-slate-700">Leyenda y supuestos del mapa</summary>
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-800">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Mantener (margen y carga)
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-900">
                <span className="h-2 w-2 rounded-full bg-amber-500" /> Reagrupar o revisar
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-800">
                <span className="h-2 w-2 rounded-full bg-rose-500" /> Probable cierre (déficit claro)
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-500">
                <span className="h-2 w-2 rounded-full bg-slate-400" /> Sin actividad
              </span>
            </div>
            <p className="text-xs text-slate-600">
              La confianza indica fiabilidad de la recomendación, no rentabilidad.
            </p>
            <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">Estimación operativa</span>
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">Modelo no contable</span>
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">Sin costes de material/farmacia</span>
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">Ingreso estimado por minuto</span>
            </div>
          </div>
        </details>
        )}

        {activeDashboardTab === "mapa-economico" && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full border-collapse text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="sticky left-0 z-10 border-r border-slate-200 bg-slate-50 px-2 py-2 font-semibold text-slate-700">
                  Recurso
                </th>
                {weekDayColumns.map((col) => (
                  <th key={col.iso} className="min-w-[5.5rem] px-1 py-2 text-center font-semibold text-slate-600">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resources.map((resource) => (
                <tr key={resource.id} className="border-b border-slate-100 last:border-0">
                  <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-2 py-2 font-medium text-slate-800">
                    {resource.label}
                  </td>
                  {weekDayColumns.map((col) => (
                    <td key={`${resource.id}-${col.iso}`} className="align-top p-1">
                      <div className="flex flex-col gap-1">
                        <TurnMapHalfCell
                          economicConfig={economicConfig}
                          mixedFunding={
                            turnMixedFundingByKey.get(
                              profitabilityTurnKey(col.iso, resource.id, "morning")
                            ) ?? false
                          }
                          minutosDisponiblesTurno={
                            turnAvailableMinutesByKey.get(
                              profitabilityTurnKey(col.iso, resource.id, "morning")
                            ) ?? 0
                          }
                          cell={
                            turnProfitabilityMap.get(profitabilityTurnKey(col.iso, resource.id, "morning"))!
                          }
                        />
                        <TurnMapHalfCell
                          economicConfig={economicConfig}
                          mixedFunding={
                            turnMixedFundingByKey.get(
                              profitabilityTurnKey(col.iso, resource.id, "afternoon")
                            ) ?? false
                          }
                          minutosDisponiblesTurno={
                            turnAvailableMinutesByKey.get(
                              profitabilityTurnKey(col.iso, resource.id, "afternoon")
                            ) ?? 0
                          }
                          cell={
                            turnProfitabilityMap.get(profitabilityTurnKey(col.iso, resource.id, "afternoon"))!
                          }
                        />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}

        {activeDashboardTab === "bloque-abierto" && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-4 sm:px-5">
          <h4 className="text-base font-bold tracking-tight text-[var(--ribera-navy)]">Lectura por bloque abierto</h4>
          <p className="mt-1 text-sm text-slate-700">
            Q1–Q3 agregados por día y turno: ocupación del bloque y anestesia laboral vs mercantil.
          </p>
          <details className="mt-2 rounded-lg border border-slate-200 bg-white/90 px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-slate-700">
              Metodología y limitaciones (capacidad, anestesia, bloque vs sala)
            </summary>
            <div className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-slate-600">
              <p>
                Capacidad = suma de minutos teóricos por sala según calendario base. Agregado de quirófanos Q1–Q3 por día
                y turno.
              </p>
              <p className="font-medium text-slate-700">
                Comparación simplificada de modelo de anestesia. No incluye todos los costes reales ni condiciones
                contractuales.
              </p>
              <p>
                Los saldos de anestesia comparan coste de anestesia frente a ingresos del bloque; no son margen económico
                completo.
              </p>
              <p>
                El análisis por sala ayuda a detectar dispersión; el análisis por bloque abierto ayuda a decidir apertura,
                concentración o redistribución de actividad.
              </p>
            </div>
          </details>
          {lecturaBloqueAbiertoRows.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">No hay quirófanos principales en la lista de recursos.</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    <th className="px-2 py-2">Día</th>
                    <th className="px-2 py-2">Turno</th>
                    <th className="px-2 py-2 text-right">Q con actividad</th>
                    <th className="px-2 py-2 text-right">Min. programados</th>
                    <th className="px-2 py-2 text-right">Capacidad visible total</th>
                    <th className="px-2 py-2 text-right">Ocupación bloque</th>
                    <th className="px-2 py-2 text-right">Margen agregado</th>
                    <th className="px-2 py-2 text-right">Simultaneidad</th>
                    <th className="px-2 py-2 text-right">Nivel solap.</th>
                    <th className="px-2 py-2">Eficiencia anestesia</th>
                    <th className="px-2 py-2">Recomendación</th>
                  </tr>
                </thead>
                <tbody>
                  {lecturaBloqueAbiertoRows.map((row) => {
                    const a = row.anestesia;
                    const minMerc = ANESTHESIA_BLOCK_SCENARIO_PARAMS.ingresoMinimoMercantil;
                    return (
                      <Fragment key={`${row.date}-${row.shift}`}>
                        <tr className="border-b border-slate-100">
                          <td className="px-2 py-2 font-medium text-slate-800">{row.date}</td>
                          <td className="px-2 py-2 text-slate-700">{row.shift === "morning" ? "Mañana" : "Tarde"}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-slate-800">{row.qConActividad}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-slate-800">
                            {Math.round(row.minutosProgramadosTotales)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-slate-800">
                            {Math.round(row.capacidadTotalMinutos)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-slate-800">
                            {(row.ocupacionGlobal * 100).toFixed(0)}%
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-slate-800">{formatEur(row.margenAgregado)}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-slate-800">
                            {formatRatio(row.optimization.simultaneidad)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-slate-800">
                            {(row.optimization.nivelSolapamiento * 100).toFixed(0)}%
                          </td>
                          <td className="px-2 py-2 text-slate-700">
                            {row.optimization.mejoraEficienciaAnestesia ? "Mejora" : "Sin mejora"}
                          </td>
                          <td className="px-2 py-2 text-slate-700">{row.recomendacion}</td>
                        </tr>
                        <tr className="border-b border-slate-200 bg-slate-50/80 last:border-0">
                          <td
                            colSpan={11}
                            className="px-2 py-1.5 text-[11px] leading-snug text-slate-600"
                            title="No incluye enfermería, TCAE, material, farmacia, limpieza ni costes estructurales."
                          >
                            <span className="text-slate-500">Ingresos bloque (Q1–Q3): {formatEur(row.ingresosTotalesTurno)}.</span>{" "}
                            Saldo tras anestesia laboral: {formatEur(a.saldoTrasAnestesiaLaboral)}.{" "}
                            {a.mercantilNoViable ? (
                              <>
                                Saldo tras anestesia mercantil: no viable (ingresos del bloque por debajo de{" "}
                                {minMerc != null ? formatEur(minMerc) : "umbral"}).
                              </>
                            ) : (
                              <>Saldo tras anestesia mercantil: {formatEur(a.saldoTrasAnestesiaMercantil)}.</>
                            )}{" "}
                            {a.diferenciaPorModeloAnestesia == null ? (
                              <>Diferencia por modelo de anestesia: — (opción mercantil no viable). </>
                            ) : (
                              <>
                                Diferencia por modelo de anestesia: {formatSignedEurDelta(a.diferenciaPorModeloAnestesia)}.{" "}
                              </>
                            )}
                            <span className="font-medium text-slate-700">{a.recomendacionAnestesia}</span>
                            {a.puntoEquilibrioMercantilVsLaboral != null ? (
                              <span
                                className="text-slate-500"
                                title={ANESTHESIA_EQUILIBRIO_LABORAL_MERCANTIL_TOOLTIP}
                              >
                                {" "}
                                Equilibrio laboral/mercantil: {formatEur(a.puntoEquilibrioMercantilVsLaboral)} ingresos
                                bloque.
                              </span>
                            ) : null}
                            {" "}
                            <span className="font-medium text-slate-700">
                              Simultaneidad bloque: {formatRatio(row.optimization.simultaneidad)} (Q activos:{" "}
                              {row.optimization.numeroQuirofanosActivos} / recursos críticos: {row.optimization.recursosCriticos}).
                            </span>{" "}
                            Nivel de solapamiento: {(row.optimization.nivelSolapamiento * 100).toFixed(0)}%.{" "}
                            Eficiencia anestesia:{" "}
                            {row.optimization.eficienciaBand === "positiva"
                              ? "positiva"
                              : row.optimization.eficienciaBand === "neutra"
                                ? "neutra"
                                : "negativa"}
                            . {row.recommendationSimulation}
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}

        {activeDashboardTab === "bloque-abierto" && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-4 sm:px-5">
          <h4 className="text-base font-bold tracking-tight text-[var(--ribera-navy)]">Optimización estructural del bloque</h4>
          <p className="mt-1 text-sm text-slate-700">
            Simulación de apertura (1, 2 o 3 quirófanos) para decidir concentración óptima sin modificar reservas reales.
          </p>
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
            Esta optimización es una simulación. No modifica la programación real. Los cambios deben ser validados manualmente.
          </p>
          <div className="mt-2">
            <button
              type="button"
              disabled
              title="Sin efecto: requiere implementación futura y validación manual."
              className="rounded-md border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500"
            >
              Aplicar cambios (requiere implementación futura)
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            La confianza indica fiabilidad de la recomendación simulada, no rentabilidad.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-3 shadow-sm">
              <p className="text-[11px] font-medium text-emerald-900">Bloques con mejora simulada</p>
              <p className="text-lg font-bold text-emerald-900">{structuralExecutive.bloquesConMejora}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm">
              <p className="text-[11px] font-medium text-slate-700">Mejora económica estimada total</p>
              <p className="text-lg font-bold text-slate-900">{formatEur(structuralExecutive.mejoraTotal)}</p>
            </div>
          </div>
          {structuralOptimizationRows.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">No hay datos suficientes para simular configuraciones de bloque.</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    <th className="px-2 py-2">Día</th>
                    <th className="px-2 py-2">Turno</th>
                    <th className="px-2 py-2">Estado actual</th>
                    <th className="px-2 py-2">Configuración sugerida (no aplicada)</th>
                    <th className="px-2 py-2 text-right">Mejora estimada</th>
                    <th className="px-2 py-2">Recomendación</th>
                  </tr>
                </thead>
                <tbody>
                  {structuralOptimizationRows.map((row) => {
                    const s = row.simulation;
                    const trace = row.iterative;
                    const improving = s.marginDeltaOptimalVsCurrent > 0;
                    const confidence = structuralConfidenceBadge(trace.confidenceLevel);
                    return (
                      <tr
                        key={`struct-${row.date}-${row.shift}`}
                        className={`border-b border-slate-100 last:border-0 ${improving ? "bg-emerald-50/50" : "bg-slate-50/40"}`}
                      >
                        <td className="px-2 py-2 font-medium text-slate-800">{row.date}</td>
                        <td className="px-2 py-2 text-slate-700">{row.shift === "morning" ? "Mañana" : "Tarde"}</td>
                        <td className="px-2 py-2 text-slate-700">
                          {s.current.openedOperatingRooms} Q · margen {formatEur(s.current.margen)} · score{" "}
                          {s.current.score.toFixed(1)}
                        </td>
                        <td className="px-2 py-2 text-slate-700">
                          {s.optimal.openedOperatingRooms} Q · margen {formatEur(s.optimal.margen)} · score{" "}
                          {s.optimal.score.toFixed(1)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-800">
                          {s.marginDeltaOptimalVsCurrent >= 0 ? "+" : ""}
                          {formatEur(s.marginDeltaOptimalVsCurrent)}
                        </td>
                        <td className="px-2 py-2 text-slate-700">
                          <span className={`mb-1 inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${confidence.className}`}>
                            {confidence.label}
                          </span>{" "}
                          {s.recommendation} Ocupación {Math.round(s.current.ocupacion * 100)}% →{" "}
                          {Math.round(s.optimal.ocupacion * 100)}%. Dispersión {s.current.dispersion.toFixed(1)} →{" "}
                          {s.optimal.dispersion.toFixed(1)}.
                          <details className="mt-2 rounded border border-slate-200 bg-white px-2 py-1">
                            <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                              Ver traza de optimización
                            </summary>
                            <div className="mt-1 space-y-1 text-xs text-slate-600">
                              {trace.steps.length === 0 ? (
                                <p>Sin pasos aplicables: {trace.reason}</p>
                              ) : (
                                trace.steps.map((step) => (
                                  <p key={`step-${row.date}-${row.shift}-${step.iteration}`}>
                                    Iteración {step.iteration}: {step.fromOpenedRooms} quirófanos → {step.toOpenedRooms}{" "}
                                    quirófanos. Score {step.scoreBefore.toFixed(1)} → {step.scoreAfter.toFixed(1)}. Margen{" "}
                                    {formatEur(step.marginBefore)} → {formatEur(step.marginAfter)}.
                                    Motivo: {step.reason}
                                  </p>
                                ))
                              )}
                              <p className="font-medium text-slate-700">
                                Motivos de confianza:{" "}
                                {trace.confidenceReasons.length > 0 ? trace.confidenceReasons.join("; ") : "sin motivos destacados"}.
                              </p>
                              <p className="font-medium text-amber-900">
                                Requiere validación manual antes de aplicar.
                              </p>
                            </div>
                          </details>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}

        {activeDashboardTab === "personal" && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-4 sm:px-5">
          <h4 className="text-base font-bold tracking-tight text-[var(--ribera-navy)]">
            Optimización de personal por franja
          </h4>
          <p className="mt-1 text-sm text-slate-700">
            Detección de picos intra-turno para sugerir refuerzo parcial de personal. Solo simulación de lectura.
          </p>
          {temporalLoadRows.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">No hay datos suficientes para analizar carga temporal por franja.</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    <th className="px-2 py-2">Día</th>
                    <th className="px-2 py-2">Turno</th>
                    <th className="px-2 py-2">Tramos</th>
                    <th className="px-2 py-2">Recomendación</th>
                    <th className="px-2 py-2 text-right">Impacto estimado</th>
                  </tr>
                </thead>
                <tbody>
                  {temporalLoadRows.map((row) => (
                    <tr key={`temporal-${row.date}-${row.shift}`} className="border-b border-slate-100 last:border-0">
                      <td className="px-2 py-2 font-medium text-slate-800">{row.date}</td>
                      <td className="px-2 py-2 text-slate-700">{row.shift === "morning" ? "Mañana" : "Tarde"}</td>
                      <td className="px-2 py-2 text-slate-700">
                        <div className="flex flex-wrap gap-1">
                          {row.analysis.buckets.map((b) => (
                            <span
                              key={`bucket-${row.date}-${row.shift}-${b.index}`}
                              className={`rounded-full border px-2 py-0.5 text-[11px] ${
                                b.hasStaffDeficit
                                  ? "border-rose-200 bg-rose-50 text-rose-900"
                                  : b.isPeak
                                    ? "border-amber-200 bg-amber-50 text-amber-900"
                                    : "border-slate-200 bg-slate-50 text-slate-700"
                              }`}
                              title={`Ocupados: ${Math.round(b.minutosOcupados)} min · Simultáneas: ${b.intervencionesSimultaneas} · Q activos: ${b.quirofanosActivos}`}
                            >
                              {b.rangeLabel}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-slate-700">
                        <span className="inline-block rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-900">
                          Sugerencia (no aplicada)
                        </span>{" "}
                        {row.analysis.recommendation}
                      </td>
                      <td className="px-2 py-2 text-right text-slate-700">
                        Ocupación +{row.analysis.estimatedImpact.mejoraOcupacionPct}% · Simultaneidad +
                        {row.analysis.estimatedImpact.mejoraSimultaneidadPct}% ·{" "}
                        {row.analysis.estimatedImpact.evitaAperturaExtra ? "Evita apertura de quirófano extra" : "Sin impacto en apertura"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}

        {activeDashboardTab === "dinamica-quirurgica" && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-4 sm:px-5">
            <h4 className="text-base font-bold tracking-tight text-[var(--ribera-navy)]">Dinámica quirúrgica</h4>
            <p className="mt-1 text-sm text-slate-700">
              Este análisis describe patrones de programación y variabilidad operativa. No evalúa calidad clínica.
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Las métricas por cirujano requieren volumen suficiente para interpretarse correctamente.
            </p>

            {surgeonDynamicsRows.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No hay suficiente actividad esta semana para analizar dinámica quirúrgica.
              </p>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-3 shadow-sm">
                    <p className="text-[11px] font-medium text-emerald-900">Mayor actividad</p>
                    <p className="text-sm font-semibold text-emerald-900">
                      {surgeonDynamicsHighlights.byActivity?.surgeonName ?? "—"}
                    </p>
                    <p className="text-xs text-emerald-800">
                      {surgeonDynamicsHighlights.byActivity
                        ? `${Math.round(surgeonDynamicsHighlights.byActivity.minutosProgramados)} min`
                        : "dato no disponible"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-3 shadow-sm">
                    <p className="text-[11px] font-medium text-sky-900">Mayor antelación</p>
                    <p className="text-sm font-semibold text-sky-900">{surgeonDynamicsHighlights.byLead?.surgeonName ?? "—"}</p>
                    <p className="text-xs text-sky-800">
                      {surgeonDynamicsHighlights.byLead?.antelacionMediaDias != null
                        ? `${surgeonDynamicsHighlights.byLead.antelacionMediaDias.toFixed(1)} días`
                        : "dato no disponible"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-3 shadow-sm">
                    <p className="text-[11px] font-medium text-amber-950">
                      Mayor oportunidad de revisión por cancelaciones
                    </p>
                    {surgeonDynamicsHighlights.byCancel && surgeonDynamicsHighlights.byCancel.numeroReservas >= 3 ? (
                      <>
                        <p className="text-sm font-semibold text-amber-950">{surgeonDynamicsHighlights.byCancel.surgeonName}</p>
                        <p className="text-xs text-amber-900">
                          {surgeonDynamicsHighlights.byCancel.tasaCancelacion.toFixed(1)} %
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-amber-900">Datos insuficientes para valorar cancelaciones</p>
                    )}
                  </div>
                  <div className="rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-3 shadow-sm">
                    <p className="text-[11px] font-medium text-rose-900">Mayor variabilidad de tiempos</p>
                    <p className="text-sm font-semibold text-rose-900">{surgeonDynamicsHighlights.byVar?.surgeonName ?? "—"}</p>
                    <p className="text-xs text-rose-800">
                      {surgeonDynamicsHighlights.byVar?.variabilidadDuracion != null
                        ? `${surgeonDynamicsHighlights.byVar.variabilidadDuracion.toFixed(1)} min`
                        : "dato no disponible"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
                  <table className="min-w-full text-left text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                        <th className="px-2 py-2">Cirujano</th>
                        <th className="px-2 py-2 text-right">Reservas</th>
                        <th className="px-2 py-2 text-right">Pacientes</th>
                        <th className="px-2 py-2 text-right">Minutos</th>
                        <th className="px-2 py-2 text-right">Antelación media</th>
                        <th className="px-2 py-2 text-right">Cancelación</th>
                        <th className="px-2 py-2 text-right">Margen estimado asociado</th>
                        <th className="px-2 py-2">Observación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {surgeonDynamicsRows.map((row) => {
                        const lowLead = (row.antelacionMediaDias ?? 999) < 3;
                        const highVar = (row.variabilidadDuracion ?? 0) > 45;
                        const highCancel = row.tasaCancelacion > 20;
                        const observation =
                          highCancel
                            ? "Patrón de cancelación elevado"
                            : lowLead
                              ? "Planificación tardía"
                              : highVar
                                ? "Alta variabilidad de tiempos"
                                : "Buena planificación";
                        return (
                          <tr key={`dyn-${row.surgeonId}`} className="border-b border-slate-100 last:border-0">
                            <td className="px-2 py-2 font-medium text-slate-800">{row.surgeonName}</td>
                            <td className="px-2 py-2 text-right tabular-nums text-slate-700">{row.numeroReservas}</td>
                            <td className="px-2 py-2 text-right tabular-nums text-slate-700">{row.numeroPacientes}</td>
                            <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                              {Math.round(row.minutosProgramados)}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                              {row.antelacionMediaDias != null ? `${row.antelacionMediaDias.toFixed(1)} d` : "dato no disponible"}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                              {row.tasaCancelacion.toFixed(1)} %
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                              {row.margenEstimado != null ? formatEur(row.margenEstimado) : "dato no disponible"}
                            </td>
                            <td className="px-2 py-2 text-slate-700">
                              {observation}
                              <details className="mt-1 rounded border border-slate-200 bg-slate-50/60 px-2 py-1">
                                <summary className="cursor-pointer text-[11px] font-semibold text-slate-700">Detalle</summary>
                                <p className="mt-1 text-[11px] text-slate-600">
                                  Procedimientos frecuentes:{" "}
                                  {row.procedimientosFrecuentes.length > 0
                                    ? row.procedimientosFrecuentes.join(", ")
                                    : "dato no disponible"}
                                  . Menos de 7 días:{" "}
                                  {row.porcentajeProgramadoMenos7Dias != null
                                    ? `${row.porcentajeProgramadoMenos7Dias.toFixed(1)}%`
                                    : "dato no disponible"}
                                  . Menos de 48h:{" "}
                                  {row.porcentajeProgramadoMenos48h != null
                                    ? `${row.porcentajeProgramadoMenos48h.toFixed(1)}%`
                                    : "dato no disponible"}
                                  . Reservas liberadas: {row.reservasLiberadas}. Reservas sin pacientes: {row.reservasSinPacientes}.
                                  Quirófanos utilizados: {row.quirofanosUtilizados}. Variabilidad:{" "}
                                  {row.variabilidadDuracion != null ? `${row.variabilidadDuracion.toFixed(1)} min` : "dato no disponible"}.
                                </p>
                              </details>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {activeDashboardTab === "recomendaciones" && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-4 sm:px-5">
          <h4 className="text-base font-bold tracking-tight text-[var(--ribera-navy)]">
            🔥 Recomendaciones principales (top impacto)
          </h4>
          <p className="mt-1 text-xs text-slate-600">
            Ordenado por impacto económico estimado ajustado por confianza.
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Estas recomendaciones no modifican la programación; priorizan dónde revisar primero.
          </p>
          <div className="mt-3 space-y-2">
            {groupedUnifiedRecommendations.top.length === 0 ? (
              <p className="text-xs text-slate-500">No hay recomendaciones disponibles.</p>
            ) : (
              groupedUnifiedRecommendations.top.map((r, i) => {
                const badge = structuralConfidenceBadge(r.confidenceLevel);
                return (
                  <div key={`top-rec-${i}`} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">{r.title}</p>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-[var(--ribera-navy)]">{r.action}</p>
                    <p className="mt-0.5 text-xs text-slate-600">Motivo principal: {r.mainReason}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Impacto bruto: {formatEur(r.impactEuro)} · Ajustado: {formatEur(r.impactWeighted)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-medium text-amber-900">Requiere validación manual antes de aplicar.</p>
                    <details className="mt-2 rounded border border-slate-200 bg-slate-50/60 px-2 py-1">
                      <summary className="cursor-pointer text-[11px] font-semibold text-slate-700">Detalle técnico</summary>
                      <p className="mt-1 text-[11px] text-slate-600">{r.description}</p>
                    </details>
                  </div>
                );
              })
            )}
          </div>

          <details className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-slate-700">Impacto medio</summary>
            <div className="mt-2 space-y-1">
              {groupedUnifiedRecommendations.medio.length === 0 ? (
                <p className="text-xs text-slate-500">Sin recomendaciones de impacto medio.</p>
              ) : (
                groupedUnifiedRecommendations.medio.map((r, i) => (
                  <p key={`mid-rec-${i}`} className="text-xs text-slate-700">
                    {r.action} · bruto {formatEur(r.impactEuro)} · ajustado {formatEur(r.impactWeighted)} · confianza{" "}
                    {r.confidenceLevel}.
                  </p>
                ))
              )}
            </div>
          </details>

          <details className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-slate-700">
              Impacto bajo / exploratorio
            </summary>
            <div className="mt-2 space-y-1">
              {groupedUnifiedRecommendations.bajo.length === 0 ? (
                <p className="text-xs text-slate-500">Sin recomendaciones exploratorias.</p>
              ) : (
                groupedUnifiedRecommendations.bajo.map((r, i) => (
                  <p key={`low-rec-${i}`} className="text-xs text-slate-700">
                    {r.action} · bruto {formatEur(r.impactEuro)} · ajustado {formatEur(r.impactWeighted)} · confianza{" "}
                    {r.confidenceLevel}.
                  </p>
                ))
              )}
            </div>
          </details>
        </div>
        )}

        {activeDashboardTab === "resumen" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 shadow-sm">
            <p className="text-[11px] font-medium text-emerald-800">Mantener abiertos</p>
            <p className="text-xl font-bold text-emerald-900">{mapExecutiveStats.counts.mantener}</p>
            <p className="text-xs text-emerald-800">Margen +{formatEur(mapExecutiveStats.margenMantenerTotal)}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 shadow-sm">
            <p className="text-[11px] font-medium text-amber-900">Reagrupar actividad</p>
            <p className="text-xl font-bold text-amber-950">{mapExecutiveStats.counts.reagrupar}</p>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 shadow-sm">
            <p className="text-[11px] font-medium text-rose-800">Probable cierre</p>
            <p className="text-xl font-bold text-rose-900">{mapExecutiveStats.counts.cerrarProbable}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 shadow-sm">
            <p className="text-[11px] font-medium text-slate-600">Revisión de baja actividad</p>
            <p className="text-xl font-bold text-slate-700">{mapExecutiveStats.counts.bajaActividad}</p>
          </div>
        </div>
        )}
        {activeDashboardTab === "resumen" && (
        <p className="text-sm text-slate-700">
          <span className="font-semibold text-slate-800">{mapExecutiveStats.decisionesBajaConfianza}</span> turnos con
          baja confianza: revisión manual recomendada.
        </p>
        )}
        {activeDashboardTab === "resumen" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-3 shadow-sm">
            <p className="text-[11px] font-medium text-emerald-900">Rentables y bien ocupados</p>
            <p className="text-lg font-bold text-emerald-900">{strategicExecutiveStats.rentablesBienOcupados}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-3 shadow-sm">
            <p className="text-[11px] font-medium text-amber-950">Rentables pero infrautilizados</p>
            <p className="text-lg font-bold text-amber-950">{strategicExecutiveStats.rentablesInfrautilizados}</p>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-3 shadow-sm">
            <p className="text-[11px] font-medium text-rose-900">Llenos pero poco rentables</p>
            <p className="text-lg font-bold text-rose-900">{strategicExecutiveStats.llenosPocoRentables}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 shadow-sm">
            <p className="text-[11px] font-medium text-slate-700">Vacíos / no programar en futuros turnos</p>
            <p className="text-lg font-bold text-slate-800">{strategicExecutiveStats.vaciosCandidatosCierre}</p>
          </div>
        </div>
        )}

        {activeDashboardTab === "mapa-economico" && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-4 sm:px-5">
          <h4 className="text-base font-bold tracking-tight text-[var(--ribera-navy)]">Resumen y tendencias</h4>
          <p className="mt-1 text-sm text-slate-600">Listados por prioridad según el mapa (estimaciones operativas).</p>
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-3 shadow-sm">
              <p className="text-xs font-semibold text-rose-900">Probable cierre (déficit claro)</p>
              {mapExecutiveStats.grouped.cerrarProbable.length === 0 ? (
                <p className="mt-1 text-xs text-rose-700/70">Sin alertas.</p>
              ) : (
                <ul className="mt-1 space-y-1 text-xs text-rose-800">
                  {mapExecutiveStats.grouped.cerrarProbable.slice(0, 6).map((line, i) => (
                    <li key={`nr-${i}`}>• {line}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-3 shadow-sm">
              <p className="text-xs font-semibold text-amber-950">Reagrupar (margen positivo, baja carga)</p>
              {mapExecutiveStats.grouped.reagrupar.length === 0 ? (
                <p className="mt-1 text-xs text-amber-800/70">Sin alertas.</p>
              ) : (
                <ul className="mt-1 space-y-1 text-xs text-amber-900">
                  {mapExecutiveStats.grouped.reagrupar.slice(0, 6).map((line, i) => (
                    <li key={`inf-${i}`}>• {line}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-3 shadow-sm">
              <p className="text-xs font-semibold text-emerald-900">Mantener abiertos</p>
              {mapExecutiveStats.grouped.mantener.length === 0 ? (
                <p className="mt-1 text-xs text-emerald-700/70">Sin turnos destacados.</p>
              ) : (
                <ul className="mt-1 space-y-1 text-xs text-emerald-800">
                  {mapExecutiveStats.grouped.mantener.slice(0, 6).map((line, i) => (
                    <li key={`ren-${i}`}>• {line}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-100/70 px-3 py-3 shadow-sm">
              <p className="text-xs font-semibold text-slate-700">Revisar por baja actividad</p>
              {mapExecutiveStats.grouped.bajaActividad.length === 0 ? (
                <p className="mt-1 text-xs text-slate-500">Sin turnos vacíos.</p>
              ) : (
                <ul className="mt-1 space-y-1 text-xs text-slate-600">
                  {mapExecutiveStats.grouped.bajaActividad.slice(0, 6).map((line, i) => (
                    <li key={`sa-${i}`}>• {line}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-3 shadow-sm">
            <p className="text-xs font-semibold text-amber-950">Revisión (no cierre inmediato)</p>
            {mapExecutiveStats.grouped.revisar.length === 0 ? (
              <p className="mt-1 text-xs text-amber-900/70">Sin turnos en revisión económica puntual.</p>
            ) : (
              <ul className="mt-1 space-y-1 text-xs text-amber-900">
                {mapExecutiveStats.grouped.revisar.slice(0, 6).map((line, i) => (
                  <li key={`rev-${i}`}>• {line}</li>
                ))}
              </ul>
            )}
          </div>
          <details className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <summary className="cursor-pointer text-xs font-semibold text-slate-700">Cómo interpretar este mapa</summary>
            <div className="mt-2 space-y-2 text-xs leading-relaxed text-slate-600">
              <p>No sustituye facturación real: es una estimación para priorización operativa.</p>
              <p>La acción sugerida en cada celda prioriza decisiones ejecutivas (mantener, reagrupar, revisar o cerrar).</p>
              <p>
                El mapa usa coste de apertura por turno y no equivale a la rentabilidad marginal por sala de la sección
                económica.
              </p>
              <p>
                La lectura estratégica (rentables bien ocupados / infrautilizados, etc.) cruza margen estimado y ocupación;
                no sustituye la revisión manual.
              </p>
              <p>
                Umbrales activos: rentable ≥ {formatEur(economicConfig.umbralRentable)}, no rentable &lt;{" "}
                {formatEur(economicConfig.umbralNoRentable)} y mínimo {economicConfig.umbralMinutosRentableMapa} min.
              </p>
            </div>
          </details>
        </div>
        )}
      </div>

      {activeDashboardTab === "metricas" && (
      <div className="space-y-5 border-t border-slate-200 pt-8">
        <div>
          <h3 className="text-base font-bold tracking-tight text-[var(--ribera-navy)]">Métricas operativas</h3>
          <p className="mt-1 text-sm text-slate-600">Misma vista de huecos que el calendario para la semana seleccionada.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {metricsCards(totals).map((c) => (
            <SummaryCard key={c.label} label={c.label} value={c.value} />
          ))}
        </div>

        <details className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold text-slate-700">Cómo se calcula la ocupación %</summary>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            La ocupación mostrada es <span className="font-medium">minutos programados (tramo base)</span> respecto a{" "}
            <span className="font-medium">minutos disponibles</span> (excluye bloqueos). Los minutos en desborde
            corresponden a tramos de continuación visual.
          </p>
        </details>

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <th className="px-3 py-2">Recurso</th>
              <th className="px-3 py-2">Turno</th>
              <th className="px-3 py-2 text-right">Disp.</th>
              <th className="px-3 py-2 text-right">Prog.</th>
              <th className="px-3 py-2 text-right">Res. vacía</th>
              <th className="px-3 py-2 text-right">Libre</th>
              <th className="px-3 py-2 text-right">Intra</th>
              <th className="px-3 py-2 text-right">Desb.</th>
              <th className="px-3 py-2 text-right">Ocup. %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.resourceId}-${row.shift}`} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 font-medium text-slate-800">{row.resourceLabel}</td>
                <td className="px-3 py-2 text-slate-600">{shiftLabel[row.shift] ?? row.shift}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{row.availableMinutes}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{row.programmedMinutes}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{row.reservedEmptyMinutes}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{row.freeSlotMinutes}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{row.intraBlockFreeMinutes}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{row.overflowMinutes}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                  {row.occupancyPercent != null ? row.occupancyPercent.toFixed(1) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
      )}

      {activeDashboardTab === "metricas" && (
      <div className="space-y-5 border-t border-slate-200 pt-8">
        <h3 className="text-base font-bold tracking-tight text-[var(--ribera-navy)]">Rentabilidad marginal (estimada)</h3>
        <p className="mt-1 text-sm text-slate-700">
          Por recurso y turno: ingresos y costes marginales sobre la actividad programada (sin coste fijo de apertura del
          mapa superior).
        </p>
        <details className="mt-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--ribera-navy)]">
            Metodología y limitaciones
          </summary>
          <div className="mt-2 space-y-2 border-t border-slate-200 pt-2 text-xs text-slate-600">
            <p>Simulación basada en supuestos configurables. No sustituye facturación real.</p>
            <p>
              Modelo marginal por sala/recurso: estima ingresos y costes asociados a la actividad programada, no a la
              apertura estructural del turno.
            </p>
            <p>
              Costes estimados incluyen coste marginal de quirófano, personal estimado sobre minutos programados y
              coste variable por paciente.
            </p>
            <p>
              Los desbordes se muestran como ineficiencia operativa, pero no se facturan dos veces en esta simulación.
            </p>
            <p>
              El análisis de equipos compartidos se tratará en una sección separada para no mezclar costes de sala con
              costes de personal compartido.
            </p>
            <p>
              El semáforo (rentable / ajustado / no rentable) es un indicador{" "}
              <span className="font-medium">económico estimado</span>; no es valoración clínica ni calidad asistencial.
            </p>
          </div>
        </details>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <EconomicSummaryCard label="Ingresos estimados" value={formatEur(economicTotals.ingresosEstimados)} />
          <EconomicSummaryCard label="Costes estimados" value={formatEur(economicTotals.costesEstimados)} />
          <EconomicSummaryCard
            label="Margen estimado"
            value={formatEur(economicTotals.margenEstimado)}
            tone={economicCardTone(economicTotals)}
          />
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-3 py-2">Recurso</th>
                <th className="px-3 py-2">Turno</th>
                <th className="px-3 py-2 text-right">Ingresos</th>
                <th className="px-3 py-2 text-right">Costes</th>
                <th className="px-3 py-2 text-right">Margen</th>
                <th className="px-3 py-2 text-right">Margen/min ocupación</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {economicRows.map((row: EconomicMetricsRow) => (
                <tr
                  key={`eco-${row.resourceId}-${row.shift}`}
                  className={`border-b border-slate-100 last:border-0 ${rowClassesEstado(row.estadoRentabilidad)}`}
                >
                  <td className="px-3 py-2 font-medium text-slate-800">{row.resourceLabel}</td>
                  <td className="px-3 py-2 text-slate-600">{shiftLabel[row.shift] ?? row.shift}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-800">{formatEur(row.ingresosEstimados)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-800">{formatEur(row.costesEstimados)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-800">{formatEur(row.margenEstimado)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                    {formatEurMin(row.margenPorMinutoProgramado)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeEstadoClasses(row.estadoRentabilidad)}`}
                    >
                      {estadoRentabilidadLabel(row.estadoRentabilidad)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {activeDashboardTab === "metricas" && (
      <div className="border-t border-slate-200 pt-6">
        <h3 className="text-base font-bold text-[var(--ribera-navy)]">Configuración económica</h3>
        <p className="mt-1 text-xs text-slate-600">
          Supuestos numéricos del modelo (mapa y rentabilidad marginal). Importe un Excel con hoja «configuracion» o use
          los valores por defecto.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <input
            ref={economicFileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setEconomicImportError(null);
              try {
                const buffer = await file.arrayBuffer();
                const parsed = parseEconomicConfigFromXlsx(buffer);
                if (!parsed.ok) {
                  setEconomicImportError(parsed.error);
                  return;
                }
                setEconomicConfig(parsed.config);
              } catch {
                setEconomicImportError("No se pudo leer el archivo.");
              }
            }}
          />
          <button
            type="button"
            onClick={() => economicFileInputRef.current?.click()}
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
          >
            Importar configuración económica
          </button>
          {isCustomEconomicConfig ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              <span className="font-medium">Configuración económica activa</span>
              <button
                type="button"
                onClick={() => {
                  setEconomicConfig({ ...DEFAULT_ECONOMIC_CONFIG });
                  setEconomicImportError(null);
                }}
                className="rounded border border-emerald-600/40 bg-white px-2 py-0.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
              >
                Reset
              </button>
            </div>
          ) : null}
        </div>
        {economicImportError ? (
          <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {economicImportError}
          </p>
        ) : null}
      </div>
      )}

      {activeDashboardTab === "personal" && (
      <div className="border-t border-slate-200 pt-6">
        <h3 className="text-base font-bold text-[var(--ribera-navy)]">Eficiencia por anestesista asignado (estimado)</h3>
        <p className="mt-1 text-xs text-slate-600">
          Basado en asignaciones de anestesia y actividad programada. No incluye otros roles (enfermería, TCAE).
        </p>

        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          {anesthetistEfficiencyRows.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">
              No hay filas para esta semana: asigne anestesistas en el módulo correspondiente o indique anestesista en la
              reserva, y asegúrese de tener actividad con pacientes en la semana visible.
            </p>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <th className="px-3 py-2">Anestesista</th>
                  <th className="px-3 py-2">Turno</th>
                  <th className="px-3 py-2 text-right">Minutos ocupados</th>
                  <th className="px-3 py-2 text-right">Nº quirófanos</th>
                  <th className="px-3 py-2 text-right">Nº bloques</th>
                  <th className="px-3 py-2">Solapes</th>
                </tr>
              </thead>
              <tbody>
                {anesthetistEfficiencyRows.map((row) => (
                  <tr
                    key={`${row.anesthetistId}-${row.date}-${row.shift}`}
                    className={`border-b border-slate-100 last:border-0 ${anesthesiaEfficiencyRowClass(row)}`}
                  >
                    <td className="px-3 py-2 font-medium text-slate-800">{row.anesthetistLabel}</td>
                    <td className="px-3 py-2 text-slate-600">{row.shiftTurnLabel}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-800">{row.minutosOcupados}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-800">{row.numeroQuirofanosCubiertos}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-800">{row.numeroBloques}</td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          row.tieneSolapes
                            ? "inline-block rounded-full border border-rose-200 bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-900"
                            : "inline-block rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-900"
                        }
                      >
                        {row.tieneSolapes ? "Sí" : "No"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      )}
    </section>
  );
}
