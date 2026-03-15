"use client";

/**
 * Navegación semanal: anterior / siguiente semana.
 */

import { getWeekStart } from "@/lib/utils";

interface WeekNavigationProps {
  weekStart: Date;
  onWeekChange: (newStart: Date) => void;
  canGoNext?: boolean;
}

export function WeekNavigation({
  weekStart,
  onWeekChange,
  canGoNext = true,
}: WeekNavigationProps) {
  const goPrev = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    onWeekChange(d);
  };

  const goNext = () => {
    if (!canGoNext) return;
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    onWeekChange(d);
  };

  const weekLabel = weekStart.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 4);
  const rangeLabel = `${weekLabel} – ${weekEnd.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  })}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={goPrev}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          ← Semana anterior
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={!canGoNext}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Semana siguiente →
        </button>
      </div>
      <span className="text-sm font-medium text-gray-600">{rangeLabel}</span>
    </div>
  );
}
