"use client";

import { useEffect, useMemo, useState } from "react";
import { WeekNavigation } from "@/components/calendar/WeekNavigation";
import { getAssignments } from "@/lib/anesthetistAssignments";
import { buildPrintableWeek } from "@/lib/program/printableWeek";
import type { Reservation, User } from "@/lib/types";
import { getWeekDays, getWeekStart, toISODate } from "@/lib/utils";

export function SemanaImprimir({
  reservations,
  users,
}: {
  reservations: Reservation[];
  users: User[];
}) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [assignments, setAssignments] = useState<Array<{
    date: string;
    shift: string;
    assignmentType: string;
    resourceId: string;
    anesthetistId?: string;
  }>>([]);
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const from = toISODate(weekDays[0]!);
  const to = toISODate(weekDays[weekDays.length - 1]!);

  useEffect(() => {
    let cancelled = false;
    getAssignments({ dateFrom: from, dateTo: to })
      .then((list) => {
        if (cancelled) return;
        setAssignments(list.map((item) => ({
          date: item.date,
          shift: item.shift,
          assignmentType: item.assignmentType,
          resourceId: item.resourceId,
          anesthetistId: item.anesthetistId,
        })));
      })
      .catch(() => {
        if (!cancelled) setAssignments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const rows = useMemo(
    () => buildPrintableWeek({ from, to, reservations, assignments, users }),
    [from, to, reservations, assignments, users],
  );

  return (
    <section id="semana-imprimir" className="rounded-xl border border-slate-200 bg-white p-6">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #semana-imprimir, #semana-imprimir * { visibility: visible; }
          #semana-imprimir {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            border: 0;
            padding: 0;
            background: white;
          }
          .semana-imprimir-no-print { display: none !important; }
          #semana-imprimir table { font-size: 11px; }
          #semana-imprimir thead { display: table-header-group; }
        }
        @page { margin: 12mm; }
      `}</style>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[var(--ribera-navy)]">Semana para imprimir</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Día, turno, quirófano, cirujano, caso, procedimiento, hora y anestesista.
            La etiqueta del caso no identifica al paciente.
            Las iniciales solo salen del Excel subido en esa sesión, en el parte de esa respuesta.
          </p>
        </div>
        <button
          type="button"
          className="semana-imprimir-no-print rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          onClick={() => window.print()}
        >
          Imprimir
        </button>
      </div>
      <div className="semana-imprimir-no-print mb-4">
        <WeekNavigation weekStart={weekStart} onWeekChange={setWeekStart} />
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-sm text-slate-500">
          Esta semana no tiene pacientes programados.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="mb-2 text-left text-sm font-medium text-slate-700">
              Semana del {from.split("-").reverse().join("/")} al {to.split("-").reverse().join("/")}
            </caption>
            <thead>
              <tr className="bg-slate-100 text-left text-slate-700">
                <th className="border border-slate-300 px-2 py-1">Día</th>
                <th className="border border-slate-300 px-2 py-1">Turno</th>
                <th className="border border-slate-300 px-2 py-1">Quirófano</th>
                <th className="border border-slate-300 px-2 py-1">Cirujano</th>
                <th className="border border-slate-300 px-2 py-1">Caso</th>
                <th className="border border-slate-300 px-2 py-1">Procedimiento</th>
                <th className="border border-slate-300 px-2 py-1">Hora</th>
                <th className="border border-slate-300 px-2 py-1">Anestesista</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.date}-${row.resourceId}-${row.time}-${row.caseLabel}-${index}`}>
                  <td className="border border-slate-300 px-2 py-1 capitalize">{row.day}</td>
                  <td className="border border-slate-300 px-2 py-1">{row.shiftLabel}</td>
                  <td className="border border-slate-300 px-2 py-1">{row.resourceLabel}</td>
                  <td className="border border-slate-300 px-2 py-1">{row.surgeon}</td>
                  <td className="border border-slate-300 px-2 py-1">{row.caseLabel}</td>
                  <td className="border border-slate-300 px-2 py-1">{row.procedure}</td>
                  <td className="border border-slate-300 px-2 py-1">{row.time}</td>
                  <td className="border border-slate-300 px-2 py-1">{row.anesthetist || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
