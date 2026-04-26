"use client";

import { useMemo } from "react";
import {
  ASSIGNMENT_FULL_SHIFT,
  type AnesthetistAssignment,
  type Reservation,
  type ResourceId,
  type Shift,
  type SlotView,
  type User,
} from "@/lib/types";
import { getEffectiveTotalMinutes, getSlots, getWeekDays, toISODate } from "@/lib/utils";
import {
  aggregateOperatingRoomMetrics,
  breakdownByResourceAndShift,
  type OperatingRoomMetricsTotals,
} from "@/lib/metrics/operatingRoomMetrics";
import {
  aggregateEconomicMetrics,
  breakdownEconomicByResourceAndShift,
  buildTurnProfitabilityMap,
  costeAperturaTurnoDefault,
  profitabilityTurnKey,
  type EconomicMetricsRow,
  type EconomicMetricsTotals,
  type EstadoRentabilidad,
  type TurnOpeningEstado,
  type TurnProfitabilityCell,
} from "@/lib/metrics/economicModel";

export interface CuadroDeMandoProps {
  slotViews: SlotView[];
  weekStart: Date;
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

function turnMapTooltip(cell: TurnProfitabilityCell): string {
  const minP = Math.round(cell.minutosProgramados);
  const base =
    cell.estado === "sin_actividad"
      ? `Ingresos: ${formatEur(cell.ingresosTurno)} · Min. programados: ${minP}`
      : `Ingresos estimados: ${formatEur(cell.ingresosTurno)} · Coste apertura estimado: ${formatEur(costeAperturaTurnoDefault)} · Min. programados: ${minP}`;
  if (cell.estado !== "sin_actividad" && minP > 0 && minP < 120) {
    return `${base}. Turno con baja carga asistencial (dimensionamiento).`;
  }
  return base;
}

function TurnMapHalfCell({ cell }: { cell: TurnProfitabilityCell }) {
  const label = cell.shift === "morning" ? "M" : "T";
  const marginText =
    cell.estado === "sin_actividad"
      ? "—"
      : `${cell.margenTurno >= 0 ? "+" : ""}${formatEur(cell.margenTurno).replace("−", "-")}`;
  const minProgLine =
    cell.estado === "sin_actividad" ? "—" : `${Math.round(cell.minutosProgramados)} min`;
  const pacText =
    cell.estado === "sin_actividad" ? "Sin act." : `${cell.pacientes} pac.`;
  return (
    <div
      title={turnMapTooltip(cell)}
      className={`flex min-h-[4.25rem] flex-col justify-center gap-0.5 rounded border px-1 py-1 text-center text-[10px] leading-tight sm:text-[11px] ${turnMapHalfCellClasses(cell.estado)}`}
    >
      <span className="font-bold">{label}</span>
      <span className="text-[9px] font-normal opacity-90 sm:text-[10px]">{minProgLine}</span>
      <span className="tabular-nums font-semibold">{marginText}</span>
      <span className="opacity-90">{pacText}</span>
    </div>
  );
}

export function CuadroDeMando({
  slotViews,
  weekStart,
  lastReservationsFetchedAt,
  resources,
  reservations = [],
  anesthetistAssignments = [],
  usersDirectory = [],
}: CuadroDeMandoProps) {
  const totals = useMemo(() => aggregateOperatingRoomMetrics(slotViews), [slotViews]);
  const rows = useMemo(
    () => breakdownByResourceAndShift(slotViews, resources),
    [slotViews, resources]
  );

  const economicTotals = useMemo(() => aggregateEconomicMetrics(slotViews), [slotViews]);
  const economicRows = useMemo(
    () => breakdownEconomicByResourceAndShift(slotViews, resources),
    [slotViews, resources]
  );

  const economicCardTone = (t: EconomicMetricsTotals): "positive" | "warning" | "negative" | "neutral" => {
    if (t.estadoRentabilidad === "rentable") return "positive";
    if (t.estadoRentabilidad === "ajustado") return "warning";
    if (t.estadoRentabilidad === "no_rentable") return "negative";
    return "neutral";
  };

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
    () => buildTurnProfitabilityMap(
      slotViews,
      resources.map((r) => r.id),
      weekDatesIso
    ),
    [slotViews, resources, weekDatesIso]
  );

  const turnEfficiencyTrends = useMemo(() => {
    const labelById = new Map(resources.map((r) => [r.id, r.label]));
    const lines: string[] = [];
    for (const c of turnProfitabilityMap.values()) {
      if (c.estado === "sin_actividad") continue;
      const lab = labelById.get(c.resourceId) ?? c.resourceId;
      const turno = c.shift === "morning" ? "Mañana" : "Tarde";
      const prefix = `${lab}, ${c.date} · ${turno}`;
      if (c.minutosProgramados > 0 && c.minutosProgramados < 60) {
        lines.push(`${prefix}: infrautilización severa`);
      }
      if (c.pacientes === 1) {
        lines.push(`${prefix}: reagrupar`);
      }
      if (c.margenTurno < 0) {
        lines.push(`${prefix}: no rentable`);
      }
    }
    return lines;
  }, [turnProfitabilityMap, resources]);

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

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-[var(--ribera-navy)]">Cuadro de mando</h2>
        <p className="mt-1 text-sm text-slate-600">
          Métricas derivadas de la misma vista de huecos que el calendario, para la semana que empieza el{" "}
          <span className="font-medium text-slate-800">{toISODate(weekStart)}</span> ({weekRangeLabel}).
        </p>
        {updatedAt ? (
          <p className="mt-1 text-xs text-slate-500">Datos actualizados a las {updatedAt}.</p>
        ) : (
          <p className="mt-1 text-xs text-slate-500">Aún no hay marca de hora de actualización (sin refresco de reservas).</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {metricsCards(totals).map((c) => (
          <SummaryCard key={c.label} label={c.label} value={c.value} />
        ))}
      </div>

      <p className="text-xs text-slate-500">
        La ocupación mostrada es <span className="font-medium">minutos programados (tramo base)</span> respecto a{" "}
        <span className="font-medium">minutos disponibles</span> (excluye bloqueos). Los minutos en desborde corresponden a
        tramos de continuación visual.
      </p>

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

      <div className="border-t border-slate-200 pt-6">
        <h3 className="text-base font-bold text-[var(--ribera-navy)]">Rentabilidad estimada</h3>
        <p className="mt-1 text-xs text-slate-600">
          Simulación basada en supuestos configurables. No sustituye facturación real.
        </p>
        <p className="mt-1 text-xs text-slate-600">
          Modelo marginal por sala/recurso: estima ingresos y costes asociados a la actividad programada, no a la
          apertura estructural del turno.
        </p>
        <p className="mt-1 text-xs text-slate-600">
          Costes estimados incluyen coste marginal de quirófano, personal estimado sobre minutos programados y coste
          variable por paciente.
        </p>
        <p className="mt-1 text-xs text-slate-600">
          Los desbordes se muestran como ineficiencia operativa, pero no se facturan dos veces en esta simulación.
        </p>
        <p className="mt-1 text-xs text-slate-600">
          El análisis de equipos compartidos se tratará en una sección separada para no mezclar costes de sala con
          costes de personal compartido.
        </p>
        <p className="mt-1 text-xs text-slate-600">
          El semáforo (rentable / ajustado / no rentable) es un indicador <span className="font-medium">económico estimado</span>;
          no es valoración clínica ni calidad asistencial.
        </p>

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

        <div className="mt-8 border-t border-slate-200 pt-6">
          <h3 className="text-base font-bold text-[var(--ribera-navy)]">Mapa de rentabilidad de turnos</h3>
          <p className="mt-1 text-xs text-slate-600">
            Este mapa muestra la rentabilidad estimada de abrir cada turno, incluyendo costes estructurales.
          </p>
          <p className="mt-1 text-xs text-slate-600">
            No es la misma métrica que la rentabilidad marginal por sala: aquí se imputa un coste de apertura de turno.
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Coste fijo estimado por turno ({formatEur(costeAperturaTurnoDefault)}): anestesista laboral, enfermería de
            quirófano, URPA y esterilización. No incluye todavía variaciones por dotación real.
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
            <span>
              <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border border-emerald-200 bg-emerald-50" />{" "}
              Verde: rentable (margen ≥ 300 € y ≥ 120 min programados)
            </span>
            <span>
              <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border border-amber-200 bg-amber-50" /> Ámbar:
              dudoso o infrautilizado (menos de 120 min con margen no negativo, u otros casos intermedios)
            </span>
            <span>
              <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border border-rose-200 bg-rose-50" /> Rojo: no
              rentable
            </span>
            <span>
              <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border border-slate-200 bg-slate-50" /> Gris:
              sin actividad
            </span>
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
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
                            cell={
                              turnProfitabilityMap.get(
                                profitabilityTurnKey(col.iso, resource.id, "morning")
                              )!
                            }
                          />
                          <TurnMapHalfCell
                            cell={
                              turnProfitabilityMap.get(
                                profitabilityTurnKey(col.iso, resource.id, "afternoon")
                              )!
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

          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-3">
            <h4 className="text-sm font-bold text-[var(--ribera-navy)]">Tendencias de eficiencia</h4>
            {turnEfficiencyTrends.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">Sin alertas para esta semana según los criterios configurados.</p>
            ) : (
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-slate-700">
                {turnEfficiencyTrends.map((line, i) => (
                  <li key={`${line}-${i}`}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

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
    </section>
  );
}
