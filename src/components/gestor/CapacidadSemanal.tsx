"use client";

import { useMemo, useState } from "react";
import { WeekNavigation } from "@/components/calendar/WeekNavigation";
import { weeklyRoomCapacity } from "@/lib/program/roomClash";
import type { Reservation } from "@/lib/types";
import { getWeekDays, getWeekStart, toISODate } from "@/lib/utils";

const ROOMS = ["Q1", "Q2", "Q3"] as const;

function dayLabel(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1).toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function CapacidadSemanal({ reservations }: { reservations: Reservation[] }) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const days = useMemo(() => getWeekDays(weekStart).map(toISODate), [weekStart]);
  const cells = useMemo(
    () => weeklyRoomCapacity({ dates: days, reservations }),
    [days, reservations],
  );

  return (
    <section className="space-y-4">
      <WeekNavigation weekStart={weekStart} onWeekChange={setWeekStart} />
      <p className="text-sm text-gray-600">
        Minutos ocupados frente a la duración de los huecos. Un número negativo significa que los casos se salen del turno. No muestra pacientes.
      </p>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <caption className="sr-only">Capacidad por quirófano y turno</caption>
          <thead className="bg-gray-50 text-left text-gray-700">
            <tr>
              <th className="px-3 py-2 font-medium">Día</th>
              <th className="px-3 py-2 font-medium">Turno</th>
              {ROOMS.map((room) => (
                <th key={room} className="px-3 py-2 font-medium">{room}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.flatMap((date) => (["morning", "afternoon"] as const).map((shift) => (
              <tr key={`${date}-${shift}`} className="border-t border-gray-100">
                <td className="px-3 py-2 text-gray-800">{dayLabel(date)}</td>
                <td className="px-3 py-2 text-gray-800">{shift === "morning" ? "Mañana" : "Tarde"}</td>
                {ROOMS.map((room) => {
                  const cell = cells.find((item) => item.date === date && item.shift === shift && item.resourceId === room);
                  const free = cell?.freeMinutes ?? 0;
                  return (
                    <td key={room} className={`px-3 py-2 ${free < 0 ? "font-medium text-amber-800" : "text-gray-800"}`}>
                      {cell ? `${cell.usedMinutes}/${cell.capacityMinutes} · libre ${cell.freeMinutes}` : "—"}
                    </td>
                  );
                })}
              </tr>
            )))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
