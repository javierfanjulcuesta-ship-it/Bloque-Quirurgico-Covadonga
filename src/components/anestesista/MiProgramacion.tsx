"use client";

/**
 * Vista anestesista: Mi programación con datos reales.
 * - Resumen de turnos (un turno = una mañana o una tarde; varios recursos en mismo turno = 1 turno)
 * - Tabla de programación
 * - Pacientes atendidos
 * - Filtros por periodo, turno, recurso
 * - Exportable, resúmenes por mes, recurso, turno, tipo de anestesia
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import { toISODate, getWeekStart, getWeekDays } from "@/lib/utils";
import { getAssignments } from "@/lib/anesthetistAssignments";
import { getReservations } from "@/lib/reservations";
import { RESOURCES } from "@/lib/constants";
import { WeekNavigation } from "@/components/calendar/WeekNavigation";
import type { AnesthetistAssignment, Reservation, ResourceId, Shift } from "@/lib/types";
import { ASSIGNMENT_FULL_SHIFT, ASSIGNMENT_PREANESTHESIA } from "@/lib/types";

interface MiProgramacionProps {
  anesthetistId: string;
  reservations?: Reservation[];
}

interface ProgramacionRow {
  date: string;
  shift: Shift;
  resources: string[];
  hasConsultaPreanestesia: boolean;
  patientCount: number;
}

interface PatientAttended {
  id: string;
  date: string;
  shift: Shift;
  resourceId: string;
  resourceLabel: string;
  historyNumber: string;
  fullName?: string;
  procedure: string;
  anesthesiaType: string;
  insuranceType: string;
  admissionType?: string;
}

function getResourceLabel(id: string): string {
  if (id === ASSIGNMENT_FULL_SHIFT) return "Turno completo";
  return RESOURCES.find((r) => r.id === id)?.label ?? id;
}

/** Turnos distintos: (date, shift) únicos. Varios recursos mismo turno = 1 turno. */
function countTurns(assignments: AnesthetistAssignment[]): {
  total: number;
  mornings: number;
  afternoons: number;
} {
  const keys = new Set<string>();
  let mornings = 0;
  let afternoons = 0;
  for (const a of assignments) {
    const key = `${a.date}|${a.shift}`;
    if (keys.has(key)) continue;
    keys.add(key);
    if (a.shift === "morning") mornings++;
    else afternoons++;
  }
  return { total: keys.size, mornings, afternoons };
}

type InternalTab = "mi-semana" | "pacientes" | "resumen";

export function MiProgramacion({ anesthetistId, reservations: propReservations }: MiProgramacionProps) {
  const today = new Date();
  const defaultFrom = toISODate(new Date(today.getFullYear(), today.getMonth(), 1));
  const defaultTo = toISODate(new Date(today.getFullYear(), today.getMonth() + 1, 0));

  const [internalTab, setInternalTab] = useState<InternalTab>("mi-semana");
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);
  const [shiftFilter, setShiftFilter] = useState<"all" | "morning" | "afternoon">("all");
  const [resourceFilter, setResourceFilter] = useState<string>("all");
  const [assignments, setAssignments] = useState<AnesthetistAssignment[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [reservations, setReservations] = useState<Reservation[]>(propReservations ?? []);
  const [reservationsLoading, setReservationsLoading] = useState(false);

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const weekFrom = toISODate(weekDays[0]!);
  const weekTo = toISODate(weekDays[weekDays.length - 1]!);

  const effectiveFrom = useMemo(
    () => (dateFrom < weekFrom ? dateFrom : weekFrom),
    [dateFrom, weekFrom]
  );
  const effectiveTo = useMemo(
    () => (dateTo > weekTo ? dateTo : weekTo),
    [dateTo, weekTo]
  );

  useEffect(() => {
    let cancelled = false;
    setReservationsLoading(true);
    getReservations({ dateFrom: effectiveFrom, dateTo: effectiveTo })
      .then((list) => {
        if (!cancelled) setReservations(list);
      })
      .catch(() => {
        if (!cancelled) setReservations(propReservations ?? []);
      })
      .finally(() => {
        if (!cancelled) setReservationsLoading(false);
      });
    return () => { cancelled = true; };
  }, [effectiveFrom, effectiveTo]);

  const refreshAssignments = useCallback(async () => {
    setAssignmentsLoading(true);
    try {
      const list = await getAssignments({
        anesthetistId,
        dateFrom: effectiveFrom,
        dateTo: effectiveTo,
      });
      setAssignments(list);
    } catch {
      setAssignments([]);
    } finally {
      setAssignmentsLoading(false);
    }
  }, [anesthetistId, effectiveFrom, effectiveTo]);

  useEffect(() => {
    refreshAssignments();
  }, [refreshAssignments]);

  const assignmentsForWeek = useMemo(
    () => assignments.filter((a) => a.anesthetistId === anesthetistId && a.date >= weekFrom && a.date <= weekTo),
    [assignments, anesthetistId, weekFrom, weekTo]
  );

  const getProceduresForCell = useCallback(
    (dateStr: string, shift: Shift): string[] => {
      const myAssignments = assignmentsForWeek.filter(
        (a) => a.date === dateStr && a.shift === shift
      );
      const lines: string[] = [];
      const resourceIds = new Set(RESOURCES.map((r) => r.id));
      myAssignments.forEach((a) => {
        if (a.assignmentType === "PREANESTHESIA") {
          lines.push("Consulta preanestesia");
          return;
        }
        const targets = a.resourceId === ASSIGNMENT_FULL_SHIFT
          ? Array.from(resourceIds)
          : [a.resourceId];
        targets.forEach((rid) => {
          reservations
            .filter(
              (r) =>
                r.date === dateStr &&
                r.shift === shift &&
                r.resourceId === rid &&
                (r.patients?.length ?? 0) > 0
            )
            .forEach((r) => {
              (r.patients ?? []).forEach((p) => {
                lines.push(p.procedure || p.numeroHistoria || "—");
              });
            });
        });
      });
      return lines;
    },
    [assignmentsForWeek, reservations]
  );

  const filteredAssignments = useMemo(() => {
    let list = assignments;
    if (shiftFilter !== "all") list = list.filter((a) => a.shift === shiftFilter);
    if (resourceFilter !== "all") {
      if (resourceFilter === "consulta-preanestesia") {
        list = list.filter((a) => a.assignmentType === "PREANESTHESIA");
      } else if (resourceFilter === ASSIGNMENT_FULL_SHIFT) {
        list = list.filter((a) => a.assignmentType === "OR" && a.resourceId === ASSIGNMENT_FULL_SHIFT);
      } else {
        list = list.filter((a) => a.assignmentType === "OR" && a.resourceId === resourceFilter);
      }
    }
    return list;
  }, [assignments, shiftFilter, resourceFilter]);

  const turnsCount = useMemo(() => countTurns(filteredAssignments), [filteredAssignments]);

  const programacionRows = useMemo((): ProgramacionRow[] => {
    const byKey = new Map<string, ProgramacionRow>();
    const resourceIds = new Set(RESOURCES.map((r) => r.id));
    for (const a of filteredAssignments) {
      const key = `${a.date}|${a.shift}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          date: a.date,
          shift: a.shift,
          resources: [],
          hasConsultaPreanestesia: false,
          patientCount: 0,
        });
      }
      const row = byKey.get(key)!;
      if (a.assignmentType === "PREANESTHESIA") {
        row.hasConsultaPreanestesia = true;
      } else if (a.resourceId === ASSIGNMENT_FULL_SHIFT) {
        if (!row.resources.includes(ASSIGNMENT_FULL_SHIFT)) row.resources.push(ASSIGNMENT_FULL_SHIFT);
      } else {
        if (!row.resources.includes(a.resourceId)) row.resources.push(a.resourceId);
      }
    }
    for (const row of byKey.values()) {
      const targets = new Set<string>();
      if (row.resources.includes(ASSIGNMENT_FULL_SHIFT)) {
        resourceIds.forEach((r) => targets.add(r));
      } else {
        row.resources.forEach((r) => targets.add(r));
      }
      const res = reservations.filter(
        (r) => r.date === row.date && r.shift === row.shift && targets.has(r.resourceId)
      );
      row.patientCount = res.reduce((s, r) => s + (r.patients?.length ?? 0), 0);
    }
    return Array.from(byKey.values()).sort((a, b) => a.date.localeCompare(b.date) || (a.shift === "morning" ? -1 : 1));
  }, [filteredAssignments, reservations]);

  const patientsAttended = useMemo((): PatientAttended[] => {
    const seen = new Set<string>();
    const list: PatientAttended[] = [];
    const resourceIds = RESOURCES.map((r) => r.id);
    for (const a of filteredAssignments) {
      if (a.assignmentType === "PREANESTHESIA") continue;
      const targets = a.resourceId === ASSIGNMENT_FULL_SHIFT ? resourceIds : [a.resourceId];
      for (const rid of targets) {
        const res = reservations.filter(
          (r) => r.date === a.date && r.shift === a.shift && r.resourceId === rid && r.patients?.length
        );
        for (const r of res) {
          for (const p of r.patients ?? []) {
            const key = `${r.id}-${p.id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            list.push({
              id: key,
              date: a.date,
              shift: a.shift,
              resourceId: rid,
              resourceLabel: getResourceLabel(rid),
              historyNumber: p.numeroHistoria ?? "—",
              fullName: p.name,
              procedure: p.procedure ?? "—",
              anesthesiaType: p.anesthesiaType ?? "—",
              insuranceType: p.entidadFinanciadora ?? "—",
              admissionType: p.admissionType,
            });
          }
        }
      }
    }
    return list.sort((a, b) => a.date.localeCompare(b.date) || (a.shift === "morning" ? -1 : 1));
  }, [filteredAssignments, reservations]);

  const summaries = useMemo(() => {
    const byMonth = new Map<string, number>();
    const byResource = new Map<string, number>();
    const byShift = { morning: 0, afternoon: 0 };
    const byAnesthesia = new Map<string, number>();

    for (const row of programacionRows) {
      const m = row.date.slice(0, 7);
      byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
      byShift[row.shift]++;
      for (const r of row.resources) {
        byResource.set(r, (byResource.get(r) ?? 0) + 1);
      }
    }
    for (const p of patientsAttended) {
      const k = p.anesthesiaType || "—";
      byAnesthesia.set(k, (byAnesthesia.get(k) ?? 0) + 1);
    }

    return {
      byMonth: Array.from(byMonth.entries()).map(([m, c]) => ({ month: m, count: c })),
      byResource: Array.from(byResource.entries()).map(([r, c]) => ({ resource: r, label: getResourceLabel(r), count: c })),
      byShift,
      byAnesthesia: Array.from(byAnesthesia.entries()).map(([t, c]) => ({ type: t, count: c })),
    };
  }, [programacionRows, patientsAttended]);

  const exportText = useMemo(() => {
    const lines: string[] = [
      "MI PROGRAMACIÓN - ANESTESISTA",
      `Periodo: ${dateFrom} a ${dateTo}`,
      "",
      "RESUMEN TURNOS",
      `Total: ${turnsCount.total} (Mañanas: ${turnsCount.mornings}, Tardes: ${turnsCount.afternoons})`,
      "",
      "PROGRAMACIÓN",
      "Fecha\tTurno\tRecursos\tConsulta preanestesia\tPacientes",
    ];
    for (const r of programacionRows) {
      lines.push(
        `${r.date}\t${r.shift === "morning" ? "Mañana" : "Tarde"}\t${r.resources.map(getResourceLabel).join(", ")}\t${r.hasConsultaPreanestesia ? "Sí" : "—"}\t${r.patientCount}`
      );
    }
    lines.push("", "PACIENTES ATENDIDOS", "Fecha\tTurno\tRecurso\tNHC\tNombre\tProcedimiento\tAnestesia\tSeguro");
    for (const p of patientsAttended) {
      lines.push(
        `${p.date}\t${p.shift === "morning" ? "Mañana" : "Tarde"}\t${p.resourceLabel}\t${p.historyNumber}\t${p.fullName ?? "—"}\t${p.procedure}\t${p.anesthesiaType}\t${p.insuranceType}`
      );
    }
    return lines.join("\n");
  }, [dateFrom, dateTo, turnsCount, programacionRows, patientsAttended]);

  const handleCopyExport = () => {
    navigator.clipboard.writeText(exportText);
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-2 text-xl font-bold text-[var(--ribera-navy)]">Mi programación</h2>
      <p className="mb-4 text-sm text-gray-600">
        Programación según asignaciones del gestor. Un turno = una mañana o una tarde (varios quirófanos en el mismo turno cuentan como 1).
      </p>

      {/* Tabs internas */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setInternalTab("mi-semana")}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${internalTab === "mi-semana" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}
        >
          Mi semana
        </button>
        <button
          type="button"
          onClick={() => setInternalTab("pacientes")}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${internalTab === "pacientes" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}
        >
          Pacientes
        </button>
        <button
          type="button"
          onClick={() => setInternalTab("resumen")}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${internalTab === "resumen" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}
        >
          Resumen
        </button>
      </div>

      {/* Filtros (para Pacientes y Resumen) */}
      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Desde</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Hasta</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Turno</span>
          <select
            value={shiftFilter}
            onChange={(e) => setShiftFilter(e.target.value as "all" | "morning" | "afternoon")}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="all">Todos</option>
            <option value="morning">Mañana</option>
            <option value="afternoon">Tarde</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Recurso</span>
          <select
            value={resourceFilter}
            onChange={(e) => setResourceFilter(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="all">Todos</option>
            {RESOURCES.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
            <option value={ASSIGNMENT_FULL_SHIFT}>Turno completo</option>
            <option value="consulta-preanestesia">Consulta preanestesia</option>
          </select>
        </label>
        <button
          type="button"
          onClick={handleCopyExport}
          className="rounded border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Copiar tabla
        </button>
      </div>

      {(assignmentsLoading || reservationsLoading) ? (
        <p className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Cargando asignaciones y reservas…
        </p>
      ) : (
        <>
          {/* Pestaña Mi semana: grid visual */}
          {internalTab === "mi-semana" && (
            <div className="mb-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--ribera-navy)]/20 bg-[var(--ribera-navy)]/5 px-4 py-3">
                <span className="font-medium text-[var(--ribera-navy)]">Semana</span>
                <WeekNavigation weekStart={weekStart} onWeekChange={setWeekStart} canGoNext={true} />
              </div>
              {assignmentsForWeek.length === 0 ? (
                <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-6 text-center text-sm text-gray-500">
                  No tiene asignaciones para esta semana. El gestor asigna en <strong>Asignar anestesistas</strong>.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border-2 border-gray-200">
                  <table className="w-full min-w-[600px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b-2 border-gray-200 bg-gray-100">
                        <th className="w-24 border-r-2 border-gray-300 p-2 font-semibold text-gray-700">Turno</th>
                        {weekDays.map((d, i) => (
                          <th
                            key={d.toISOString()}
                            className={`min-w-[120px] p-2 text-center font-semibold text-gray-700 ${i === 0 ? "border-r border-gray-200" : "border-r-2 border-l-2 border-gray-300"}`}
                          >
                            {d.toLocaleDateString("es-ES", { weekday: "short" })}
                            <br />
                            <span className="text-xs font-normal">{d.getDate()}/{d.getMonth() + 1}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(["morning", "afternoon"] as const).map((shift) => (
                        <tr key={shift} className="border-b border-gray-100 hover:bg-gray-50/80">
                          <td className="border-r-2 border-gray-300 bg-gray-50 p-2 font-medium text-gray-800">
                            {shift === "morning" ? "Mañana" : "Tarde"}
                          </td>
                          {weekDays.map((d, i) => {
                            const dateStr = toISODate(d);
                            const procedures = getProceduresForCell(dateStr, shift);
                            const myAssignments = assignmentsForWeek.filter((a) => a.date === dateStr && a.shift === shift);
                            const resources = myAssignments
                              .filter((a) => a.assignmentType === "OR")
                              .map((a) => getResourceLabel(a.resourceId));
                            const hasConsulta = myAssignments.some((a) => a.assignmentType === "PREANESTHESIA");
                            const daySep = i < weekDays.length - 1 ? " border-r-2 border-gray-300" : "";
                            return (
                              <td key={dateStr} className={`min-h-[80px] align-top p-2${daySep}`}>
                                {myAssignments.length === 0 ? (
                                  <span className="text-xs text-gray-400">—</span>
                                ) : (
                                  <div className="space-y-1">
                                    <div className="text-xs font-medium text-[var(--ribera-navy)]">
                                      {resources.join(", ")}{hasConsulta ? " · Consulta" : ""}
                                    </div>
                                    <ul className="space-y-0.5 text-xs text-gray-700">
                                      {procedures.slice(0, 4).map((proc, idx) => (
                                        <li key={idx} className="truncate rounded bg-gray-100 px-1.5 py-0.5" title={proc}>
                                          {proc}
                                        </li>
                                      ))}
                                      {procedures.length > 4 && (
                                        <li className="text-gray-500">+{procedures.length - 4} más</li>
                                      )}
                                    </ul>
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Pestaña Pacientes */}
          {internalTab === "pacientes" && (
            <div className="mb-6">
              <h3 className="mb-2 font-semibold text-gray-800">Pacientes atendidos</h3>
              {patientsAttended.length === 0 ? (
                <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-6 text-center text-sm text-gray-500">
                  No hay pacientes en el periodo seleccionado.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full min-w-[600px] border-collapse text-sm">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border-b border-gray-200 p-2 text-left font-semibold">Fecha</th>
                        <th className="border-b border-gray-200 p-2 text-left font-semibold">Turno</th>
                        <th className="border-b border-gray-200 p-2 text-left font-semibold">Recurso</th>
                        <th className="border-b border-gray-200 p-2 text-left font-semibold">NHC</th>
                        <th className="border-b border-gray-200 p-2 text-left font-semibold">Nombre</th>
                        <th className="border-b border-gray-200 p-2 text-left font-semibold">Procedimiento</th>
                        <th className="border-b border-gray-200 p-2 text-left font-semibold">Anestesia</th>
                        <th className="border-b border-gray-200 p-2 text-left font-semibold">Seguro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patientsAttended.map((p) => (
                        <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="p-2">{p.date}</td>
                          <td className="p-2">{p.shift === "morning" ? "Mañana" : "Tarde"}</td>
                          <td className="p-2">{p.resourceLabel}</td>
                          <td className="p-2">{p.historyNumber}</td>
                          <td className="p-2">{p.fullName ?? "—"}</td>
                          <td className="p-2">{p.procedure}</td>
                          <td className="p-2">{p.anesthesiaType}</td>
                          <td className="p-2">{p.insuranceType}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Pestaña Resumen */}
          {internalTab === "resumen" && (
            <>
              <div className="mb-6 rounded-lg border-2 border-[var(--ribera-navy)]/20 bg-[var(--ribera-navy)]/5 px-4 py-4">
            <h3 className="mb-3 font-semibold text-[var(--ribera-navy)]">Resumen de turnos</h3>
            <div className="flex flex-wrap gap-6">
              <div>
                <span className="text-2xl font-bold text-[var(--ribera-navy)]">{turnsCount.total}</span>
                <span className="ml-2 text-sm text-gray-600">turnos totales</span>
              </div>
              <div>
                <span className="text-xl font-bold text-amber-700">{turnsCount.mornings}</span>
                <span className="ml-2 text-sm text-gray-600">mañanas</span>
              </div>
              <div>
                <span className="text-xl font-bold text-slate-700">{turnsCount.afternoons}</span>
                <span className="ml-2 text-sm text-gray-600">tardes</span>
              </div>
              <div>
                <span className="text-xl font-bold text-green-700">{patientsAttended.length}</span>
                <span className="ml-2 text-sm text-gray-600">pacientes atendidos</span>
              </div>
            </div>

            {/* Resúmenes adicionales */}
            <div className="mt-4 grid gap-4 border-t border-[var(--ribera-navy)]/20 pt-4 md:grid-cols-3">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Por mes</p>
                <div className="space-y-0.5 text-sm">
                  {summaries.byMonth.slice(-3).map((m) => (
                    <div key={m.month} className="flex justify-between">
                      <span>{m.month}</span>
                      <span className="font-medium">{m.count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Por recurso</p>
                <div className="space-y-0.5 text-sm">
                  {summaries.byResource.map((r) => (
                    <div key={r.resource} className="flex justify-between">
                      <span>{r.label}</span>
                      <span className="font-medium">{r.count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Por tipo de anestesia</p>
                <div className="space-y-0.5 text-sm">
                  {summaries.byAnesthesia.slice(0, 5).map((a) => (
                    <div key={a.type} className="flex justify-between">
                      <span>{a.type}</span>
                      <span className="font-medium">{a.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
