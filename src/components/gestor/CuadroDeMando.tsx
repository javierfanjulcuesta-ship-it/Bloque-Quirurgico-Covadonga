"use client";

import { useMemo } from "react";
import type { ResourceId, SlotView } from "@/lib/types";
import { getWeekDays, toISODate } from "@/lib/utils";
import {
  aggregateOperatingRoomMetrics,
  breakdownByResourceAndShift,
  type OperatingRoomMetricsTotals,
} from "@/lib/metrics/operatingRoomMetrics";

export interface CuadroDeMandoProps {
  slotViews: SlotView[];
  weekStart: Date;
  lastReservationsFetchedAt: Date | null;
  resources: { id: ResourceId; label: string }[];
}

function formatMinutes(n: number): string {
  return `${Math.round(n)} min`;
}

function formatPercent(p: number | null): string {
  if (p == null) return "—";
  return `${p.toFixed(1)} %`;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--ribera-navy)]">{value}</p>
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

export function CuadroDeMando({
  slotViews,
  weekStart,
  lastReservationsFetchedAt,
  resources,
}: CuadroDeMandoProps) {
  const totals = useMemo(() => aggregateOperatingRoomMetrics(slotViews), [slotViews]);
  const rows = useMemo(
    () => breakdownByResourceAndShift(slotViews, resources),
    [slotViews, resources]
  );

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
    </section>
  );
}
