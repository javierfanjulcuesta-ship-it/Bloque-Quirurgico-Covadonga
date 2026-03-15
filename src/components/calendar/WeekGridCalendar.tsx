"use client";

/**
 * Calendario en cuadrícula: columnas Lunes a Domingo, filas = semanas.
 * Seleccionar día para ver el estado de reserva.
 */

import { useMemo } from "react";
import { getWeekStart, getCalendarGridWeeks, toISODate } from "@/lib/utils";

const WEEKDAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];
const NUM_WEEKS = 5;

interface WeekGridCalendarProps {
  periodStart: Date;
  onPeriodChange: (newStart: Date) => void;
  onSelectDay: (date: Date) => void;
  selectedDate?: Date | null;
  isDayDisabled?: (date: Date) => boolean;
}

export function WeekGridCalendar({
  periodStart,
  onPeriodChange,
  onSelectDay,
  selectedDate = null,
  isDayDisabled,
}: WeekGridCalendarProps) {
  const periodMonday = useMemo(() => getWeekStart(periodStart), [periodStart.getTime()]);
  const grid = useMemo(() => getCalendarGridWeeks(periodMonday, NUM_WEEKS), [periodMonday.getTime()]);

  const periodLabel = useMemo(() => {
    const first = grid[0]?.[0];
    const last = grid[grid.length - 1]?.[6];
    if (!first || !last) return "";
    return `${first.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} – ${last.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}`;
  }, [grid]);

  const prevPeriod = () => {
    const d = new Date(periodMonday);
    d.setDate(d.getDate() - 7);
    onPeriodChange(d);
  };

  const nextPeriod = () => {
    const d = new Date(periodMonday);
    d.setDate(d.getDate() + 7);
    onPeriodChange(d);
  };

  const isSelected = (d: Date) => selectedDate && toISODate(d) === toISODate(selectedDate);
  const todayIso = useMemo(() => toISODate(new Date()), []);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <button type="button" onClick={prevPeriod} className="rounded p-2 text-gray-600 hover:bg-gray-100" aria-label="Semana anterior">‹</button>
        <span className="text-sm font-semibold text-gray-800">{periodLabel}</span>
        <button type="button" onClick={nextPeriod} className="rounded p-2 text-gray-600 hover:bg-gray-100" aria-label="Semana siguiente">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-sm">
        {WEEKDAY_LABELS.map((l) => (
          <div key={l} className="font-semibold text-gray-600 py-0.5">{l}</div>
        ))}
        {grid.map((week, wi) =>
          week.map((cell, di) => {
            const disabled = isDayDisabled?.(cell) ?? false;
            const selected = isSelected(cell);
            const isToday = toISODate(cell) === todayIso;
            const isCurrentMonth = cell.getMonth() === new Date().getMonth();
            return (
              <button
                key={`${wi}-${di}`}
                type="button"
                onClick={() => !disabled && onSelectDay(new Date(cell))}
                disabled={disabled}
                className={`h-9 w-9 rounded ${!isCurrentMonth ? "text-gray-300" : "text-gray-800"} ${disabled ? "cursor-not-allowed opacity-50" : "hover:bg-[var(--ribera-red)]/10"} ${selected ? "bg-[var(--ribera-red)] text-white" : ""} ${isToday && !selected ? "ring-1 ring-[var(--ribera-red)]" : ""}`}
              >
                {cell.getDate()}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
