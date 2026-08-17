"use client";

import { useMemo, useState } from "react";
import type { SurgeonManagementProfile } from "@/lib/metrics/surgeonProfileAnalytics";

function hours(minutes: number | null): string {
  if (minutes == null) return "—";
  return `${(minutes / 60).toFixed(minutes >= 600 ? 0 : 1)} h`;
}

function pct(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(0)}%`;
}

function days(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(1)} d`;
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--ribera-navy)]">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function SurgeonAnalyticsPanel({ profiles }: { profiles: SurgeonManagementProfile[] }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(profiles[0]?.surgeonId ?? null);
  const [layer, setLayer] = useState<"programmed" | "actual" | "deviation">("programmed");

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("es");
    if (!q) return profiles;
    return profiles.filter((profile) => profile.surgeonName.toLocaleLowerCase("es").includes(q));
  }, [profiles, query]);

  const selected = profiles.find((profile) => profile.surgeonId === selectedId) ?? filtered[0] ?? null;

  if (profiles.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="font-bold text-[var(--ribera-navy)]">Análisis de cirujanos</h3>
        <p className="mt-2 text-sm text-slate-600">Todavía no hay actividad programada suficiente para construir fichas.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-lg font-bold text-[var(--ribera-navy)]">Análisis de cirujanos</h3>
          <p className="mt-1 max-w-3xl text-xs text-slate-600">
            Compara lo reservado y programado en QxFlow con la actividad realmente ejecutada cuando se importe el Libro de quirófano.
          </p>
        </div>
        <label className="block min-w-64 text-xs font-semibold text-slate-600">
          Buscar cirujano
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nombre del cirujano"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-[var(--ribera-navy)]"
          />
        </label>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {filtered.map((profile) => (
          <button
            key={profile.surgeonId}
            type="button"
            onClick={() => setSelectedId(profile.surgeonId)}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold ${
              selected?.surgeonId === profile.surgeonId
                ? "border-[var(--ribera-navy)] bg-[var(--ribera-navy)] text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {profile.surgeonName}
          </button>
        ))}
        {filtered.length === 0 ? <p className="py-2 text-xs text-slate-500">Sin coincidencias.</p> : null}
      </div>

      {selected ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-base font-bold text-slate-900">{selected.surgeonName}</h4>
              <p className="text-xs text-slate-500">
                {selected.actualDataAvailable
                  ? "Actividad real agregada disponible para el periodo importado."
                  : "Actividad real pendiente de importar; QxFlow no inventa ocupación ejecutada."}
              </p>
            </div>
            <div className="flex rounded-lg border border-slate-300 bg-white p-1">
              {[
                ["programmed", "Programado"],
                ["actual", "Real"],
                ["deviation", "Desviación"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setLayer(id as typeof layer)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                    layer === id ? "bg-[var(--ribera-navy)] text-white" : "text-slate-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {layer === "programmed" ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-5">
                <Kpi label="Pacientes" value={String(selected.cases)} hint={`${selected.activeReservations} reservas activas`} />
                <Kpi label="Tiempo reservado" value={hours(selected.reservedMinutes)} />
                <Kpi label="Tiempo programado" value={hours(selected.programmedMinutes)} />
                <Kpi label="Uso de lo reservado" value={pct(selected.occupancyWithinReservedPct)} hint="Programado / reservado" />
                <Kpi label="Antelación mediana" value={days(selected.medianLeadDays)} hint={`Media ${days(selected.meanLeadDays)}`} />
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3 lg:col-span-2">
                  <p className="text-xs font-bold text-slate-800">Financiadores</p>
                  <div className="mt-2 space-y-2">
                    {selected.fundingMix.slice(0, 8).map((row) => (
                      <div key={row.financer}>
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="truncate font-medium text-slate-700">{row.financer}</span>
                          <span className="shrink-0 tabular-nums text-slate-600">{row.cases} casos · {row.shareCasesPct.toFixed(0)}%</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-[var(--ribera-navy)]" style={{ width: `${Math.max(2, row.shareCasesPct)}%` }} />
                        </div>
                      </div>
                    ))}
                    {selected.fundingMix.length === 0 ? <p className="text-xs text-slate-500">Sin datos de financiador.</p> : null}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-bold text-slate-800">Comportamiento de programación</p>
                  <dl className="mt-2 space-y-2 text-xs">
                    <div className="flex justify-between gap-2"><dt className="text-slate-600">Menos de 7 días</dt><dd className="font-semibold tabular-nums">{pct(selected.bookedUnder7DaysPct)}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-slate-600">Menos de 48 h</dt><dd className="font-semibold tabular-nums">{pct(selected.bookedUnder48hPct)}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-slate-600">Cancelaciones</dt><dd className="font-semibold tabular-nums">{selected.cancellations} · {pct(selected.cancellationRatePct)}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-slate-600">Liberaciones</dt><dd className="font-semibold tabular-nums">{selected.releases} · {pct(selected.releaseRatePct)}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-slate-600">Reservas vacías</dt><dd className="font-semibold tabular-nums">{selected.emptyReservations}</dd></div>
                  </dl>
                </div>
              </div>
            </>
          ) : null}

          {layer === "actual" ? (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Kpi label="Casos realizados" value={selected.actualCases == null ? "Pendiente" : String(selected.actualCases)} />
              <Kpi label="Tiempo real" value={selected.actualMinutes == null ? "Pendiente" : hours(selected.actualMinutes)} />
              <Kpi label="Uso real de reserva" value={pct(selected.actualVsReservedPct)} hint="Real / reservado" />
            </div>
          ) : null}

          {layer === "deviation" ? (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Kpi label="Real / reservado" value={pct(selected.actualVsReservedPct)} />
              <Kpi label="Real / programado" value={pct(selected.actualVsProgrammedPct)} />
              <Kpi
                label="Diferencia real-programado"
                value={selected.actualMinutes == null ? "Pendiente" : hours(selected.actualMinutes - selected.programmedMinutes)}
                hint="No se calcula hasta disponer del cierre real"
              />
            </div>
          ) : null}

          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-slate-800">Tendencia mensual</p>
              <span className="text-[11px] text-slate-500">Reservado · Programado · Real</span>
            </div>
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="py-1.5 pr-4">Mes</th><th className="px-2 py-1.5 text-right">Casos</th><th className="px-2 py-1.5 text-right">Reservado</th><th className="px-2 py-1.5 text-right">Programado</th><th className="pl-2 py-1.5 text-right">Real</th></tr></thead>
                <tbody>
                  {selected.monthlyTrend.slice(-12).map((row) => (
                    <tr key={row.month} className="border-b border-slate-100 last:border-0">
                      <td className="py-1.5 pr-4 font-medium text-slate-700">{row.month}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{row.cases}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{hours(row.reservedMinutes)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{hours(row.programmedMinutes)}</td>
                      <td className="pl-2 py-1.5 text-right tabular-nums">{row.actualMinutes == null ? "—" : hours(row.actualMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
