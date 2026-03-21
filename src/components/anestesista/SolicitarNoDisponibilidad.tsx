"use client";

/**
 * Pestaña anestesista: solicitar días/turnos en los que no quiere trabajar.
 * Calendario igual que la pestaña Calendario: clic en el día → elegir Mañana, Tarde o Todo el día.
 */

import { useState, useCallback } from "react";
import { getWeekStart, toISODate } from "@/lib/utils";
import { setUnavailability, getUnavailabilityForDate } from "@/lib/storageAnesthetistUnavailability";
import { WeekGridCalendar } from "@/components/calendar/WeekGridCalendar";

interface SolicitarNoDisponibilidadProps {
  anesthetistId: string;
}

export function SolicitarNoDisponibilidad({ anesthetistId }: SolicitarNoDisponibilidadProps) {
  const [periodStart, setPeriodStart] = useState(() => getWeekStart(new Date()));
  const [version, setVersion] = useState(0);
  const [pickerDate, setPickerDate] = useState<Date | null>(null);

  const isLaborable = useCallback((date: Date) => {
    const d = date.getDay();
    return d !== 0 && d !== 6;
  }, []);

  const getDayClassName = useCallback(
    (date: Date) => {
      const iso = toISODate(date);
      const { morning, afternoon } = getUnavailabilityForDate(anesthetistId, iso);
      if (morning && afternoon) return "bg-amber-200 text-amber-900 font-medium";
      if (morning || afternoon) return "bg-amber-100 text-amber-800";
      return "";
    },
    [anesthetistId, version]
  );

  const handleSelectDay = (date: Date) => {
    if (!isLaborable(date)) return;
    setPickerDate(date);
  };

  const applyChoice = (date: Date, choice: "morning" | "afternoon" | "both" | "clear") => {
    const dateStr = toISODate(date);
    if (choice === "clear") {
      setUnavailability(anesthetistId, dateStr, "morning", false);
      setUnavailability(anesthetistId, dateStr, "afternoon", false);
    } else if (choice === "both") {
      setUnavailability(anesthetistId, dateStr, "morning", true);
      setUnavailability(anesthetistId, dateStr, "afternoon", true);
    } else if (choice === "morning") {
      setUnavailability(anesthetistId, dateStr, "afternoon", false);
      setUnavailability(anesthetistId, dateStr, "morning", true);
    } else {
      setUnavailability(anesthetistId, dateStr, "morning", false);
      setUnavailability(anesthetistId, dateStr, "afternoon", true);
    }
    setVersion((v) => v + 1);
    setPickerDate(null);
  };

  const pickerDateStr = pickerDate
    ? pickerDate.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";
  const pickerStatus = pickerDate
    ? getUnavailabilityForDate(anesthetistId, toISODate(pickerDate))
    : { morning: false, afternoon: false };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-2 text-xl font-bold text-[var(--ribera-navy)]">Solicitar no disponibilidad</h2>
      <p className="mb-4 text-sm text-gray-600">
        Haga clic en un día laborable del calendario y elija si no desea trabajar por la mañana, por la tarde o todo el día. El gestor verá un aviso si intenta asignarle en esas fechas.
      </p>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="shrink-0">
          <div className="rounded-lg border border-[var(--ribera-red)]/20 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-[var(--ribera-navy)]">Elija un día</p>
            <WeekGridCalendar
              periodStart={periodStart}
              onPeriodChange={setPeriodStart}
              onSelectDay={handleSelectDay}
              selectedDate={null}
              isDayDisabled={(d) => !isLaborable(d)}
              getDayClassName={getDayClassName}
            />
            <p className="mt-3 text-xs text-gray-500">
              Amarillo = día con no disponibilidad · Sábado y domingo no laborables
            </p>
          </div>
        </div>

        <div className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50/50 p-4">
          <p className="text-sm font-medium text-gray-800">Leyenda</p>
          <ul className="mt-2 space-y-1 text-sm text-gray-600">
            <li><span className="inline-block h-4 w-5 rounded bg-amber-100 align-middle" /> Solo mañana o solo tarde</li>
            <li><span className="inline-block h-4 w-5 rounded bg-amber-200 align-middle" /> Todo el día (mañana y tarde)</li>
          </ul>
          <p className="mt-4 text-sm text-gray-600">
            Haga clic en un día de lunes a viernes para marcar o cambiar la no disponibilidad.
          </p>
        </div>
      </div>

      {pickerDate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPickerDate(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-lg font-bold text-[var(--ribera-navy)]">No disponibilidad</h3>
            <p className="mb-4 text-sm text-gray-700 capitalize">{pickerDateStr}</p>
            <p className="mb-3 text-sm font-medium text-gray-700">Seleccione turno(s):</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyChoice(pickerDate, "morning")}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${pickerStatus.morning ? "bg-amber-200 text-amber-900" : "bg-amber-50 text-amber-800 hover:bg-amber-100"}`}
              >
                Solo mañana
              </button>
              <button
                type="button"
                onClick={() => applyChoice(pickerDate, "afternoon")}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${pickerStatus.afternoon ? "bg-amber-200 text-amber-900" : "bg-amber-50 text-amber-800 hover:bg-amber-100"}`}
              >
                Solo tarde
              </button>
              <button
                type="button"
                onClick={() => applyChoice(pickerDate, "both")}
                className="rounded-lg px-4 py-2 text-sm font-medium bg-amber-100 text-amber-900 hover:bg-amber-200"
              >
                Todo el día
              </button>
            </div>
            {(pickerStatus.morning || pickerStatus.afternoon) && (
              <button
                type="button"
                onClick={() => applyChoice(pickerDate, "clear")}
                className="mt-3 w-full rounded-lg border border-gray-300 bg-white py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Quitar no disponibilidad este día
              </button>
            )}
            <button
              type="button"
              onClick={() => setPickerDate(null)}
              className="mt-4 w-full rounded-lg border-2 border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
