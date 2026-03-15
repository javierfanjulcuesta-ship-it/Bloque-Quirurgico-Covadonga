"use client";

/**
 * Fila de consulta de preanestesia: lunes y jueves por la mañana.
 * Solo visible en calendario de gestor y anestesista.
 */

import { useMemo } from "react";
import { getWeekDays, toISODate } from "@/lib/utils";
import { PREANESTHESIA_MAX_PATIENTS } from "@/lib/constants";

function isMondayOrThursday(date: Date): boolean {
  const d = date.getDay();
  return d === 1 || d === 4;
}

interface ConsultaPreanestesiaRowProps {
  weekStart: Date;
  /** Número de pacientes asignados por fecha (ISO) para mostrar X/12 */
  assignedByDate?: Record<string, number>;
}

export function ConsultaPreanestesiaRow({ weekStart, assignedByDate = {} }: ConsultaPreanestesiaRowProps) {
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-[400px] w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-gray-200 bg-amber-50/70">
            <th className="p-2 font-semibold text-gray-700">Recurso</th>
            {weekDays.map((d) => (
              <th key={d.toISOString()} className="p-2 text-sm font-semibold text-gray-700">
                {d.toLocaleDateString("es-ES", { weekday: "short" })}
                <br />
                <span className="text-xs font-normal">{d.getDate()}/{d.getMonth() + 1}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-gray-100">
            <td className="border-r border-gray-100 p-2 font-medium text-gray-700">
              Consulta de preanestesia
            </td>
            {weekDays.map((d) => {
              const dateStr = toISODate(d);
              const count = assignedByDate[dateStr] ?? 0;
              const show = isMondayOrThursday(d);
              return (
                <td key={dateStr} className="p-2">
                  {show ? (
                    <span className="inline-block rounded bg-amber-100 px-2 py-1 text-sm text-amber-900">
                      Mañana (máx {PREANESTHESIA_MAX_PATIENTS} pacientes)
                      {count > 0 && ` — ${count}/${PREANESTHESIA_MAX_PATIENTS}`}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
