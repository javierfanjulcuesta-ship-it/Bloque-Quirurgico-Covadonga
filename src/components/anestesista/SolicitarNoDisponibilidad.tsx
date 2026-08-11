"use client";

/**
 * Pestaña anestesista: declarar días/turnos de no disponibilidad.
 * En modo real el estado se comparte vía PostgreSQL/API. localStorage queda solo para demo.
 */

import { useState, useCallback, useEffect } from "react";
import { getWeekStart, toISODate } from "@/lib/utils";
import { modoDemo } from "@/lib/config";
import {
  setUnavailability,
  getUnavailabilityForDate,
  subscribeUnavailabilityChanges,
} from "@/lib/storageAnesthetistUnavailability";
import { WeekGridCalendar } from "@/components/calendar/WeekGridCalendar";

interface SolicitarNoDisponibilidadProps {
  anesthetistId: string;
}

type SharedEntry = {
  anesthetistId: string;
  date: string;
  morning: boolean;
  afternoon: boolean;
  reason?: string | null;
};

function entryKey(anesthetistId: string, date: string): string {
  return `${anesthetistId}|${date}`;
}

export function SolicitarNoDisponibilidad({ anesthetistId }: SolicitarNoDisponibilidadProps) {
  const [periodStart, setPeriodStart] = useState(() => getWeekStart(new Date()));
  const [version, setVersion] = useState(0);
  const [pickerDate, setPickerDate] = useState<Date | null>(null);
  const [shared, setShared] = useState<Map<string, SharedEntry>>(new Map());
  const [loading, setLoading] = useState(!modoDemo);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (modoDemo) return subscribeUnavailabilityChanges(() => setVersion((v) => v + 1));

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/anesthetist-unavailability", { credentials: "same-origin" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error((payload as { error?: string }).error ?? "No se pudo cargar la no disponibilidad");
        if (cancelled) return;
        const entries = (payload as { unavailability?: SharedEntry[] }).unavailability ?? [];
        setShared(new Map(entries.map((entry) => [entryKey(entry.anesthetistId, entry.date), entry])));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "No se pudo cargar la no disponibilidad");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [anesthetistId]);

  const isLaborable = useCallback((date: Date) => {
    const d = date.getDay();
    return d !== 0 && d !== 6;
  }, []);

  const statusForDate = useCallback(
    (dateStr: string) => {
      if (modoDemo) return getUnavailabilityForDate(anesthetistId, dateStr);
      const entry = shared.get(entryKey(anesthetistId, dateStr));
      return { morning: entry?.morning ?? false, afternoon: entry?.afternoon ?? false };
    },
    [anesthetistId, shared, version],
  );

  const getDayClassName = useCallback(
    (date: Date) => {
      const { morning, afternoon } = statusForDate(toISODate(date));
      if (morning && afternoon) return "bg-amber-200 text-amber-900 font-medium";
      if (morning || afternoon) return "bg-amber-100 text-amber-800";
      return "";
    },
    [statusForDate],
  );

  const handleSelectDay = (date: Date) => {
    if (!isLaborable(date) || loading || saving) return;
    setPickerDate(date);
  };

  const applyChoice = async (date: Date, choice: "morning" | "afternoon" | "both" | "clear") => {
    const dateStr = toISODate(date);
    const morning = choice === "morning" || choice === "both";
    const afternoon = choice === "afternoon" || choice === "both";
    setSaving(true);
    setError(null);
    try {
      if (modoDemo) {
        setUnavailability(anesthetistId, dateStr, "morning", morning);
        setUnavailability(anesthetistId, dateStr, "afternoon", afternoon);
        setVersion((v) => v + 1);
      } else {
        const response = await fetch("/api/anesthetist-unavailability", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ date: dateStr, morning, afternoon }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error((payload as { error?: string }).error ?? "No se pudo guardar la no disponibilidad");

        setShared((current) => {
          const next = new Map(current);
          const key = entryKey(anesthetistId, dateStr);
          if (!morning && !afternoon) next.delete(key);
          else next.set(key, { anesthetistId, date: dateStr, morning, afternoon });
          return next;
        });
      }
      setPickerDate(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la no disponibilidad");
    } finally {
      setSaving(false);
    }
  };

  const pickerDateStr = pickerDate
    ? pickerDate.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";
  const pickerStatus = pickerDate
    ? statusForDate(toISODate(pickerDate))
    : { morning: false, afternoon: false };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-2 text-xl font-bold text-[var(--ribera-navy)]">Solicitar no disponibilidad</h2>
      <p className="mb-4 text-sm text-gray-600">
        Haga clic en un día laborable y elija mañana, tarde o todo el día. En modo real la no disponibilidad queda registrada de forma central y el gestor la verá al asignar anestesistas.
      </p>

      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading && <p className="mb-4 text-sm text-gray-500">Cargando no disponibilidad…</p>}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="shrink-0">
          <div className="rounded-lg border border-[var(--ribera-red)]/20 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-[var(--ribera-navy)]">Elija un día</p>
            <WeekGridCalendar
              periodStart={periodStart}
              onPeriodChange={setPeriodStart}
              onSelectDay={handleSelectDay}
              selectedDate={null}
              isDayDisabled={(d) => !isLaborable(d) || loading || saving}
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
        </div>
      </div>

      {pickerDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && setPickerDate(null)}>
          <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-lg font-bold text-[var(--ribera-navy)]">No disponibilidad</h3>
            <p className="mb-4 text-sm text-gray-700 capitalize">{pickerDateStr}</p>
            <p className="mb-3 text-sm font-medium text-gray-700">Seleccione turno(s):</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={saving} onClick={() => void applyChoice(pickerDate, "morning")} className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${pickerStatus.morning ? "bg-amber-200 text-amber-900" : "bg-amber-50 text-amber-800 hover:bg-amber-100"}`}>Solo mañana</button>
              <button type="button" disabled={saving} onClick={() => void applyChoice(pickerDate, "afternoon")} className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${pickerStatus.afternoon ? "bg-amber-200 text-amber-900" : "bg-amber-50 text-amber-800 hover:bg-amber-100"}`}>Solo tarde</button>
              <button type="button" disabled={saving} onClick={() => void applyChoice(pickerDate, "both")} className="rounded-lg bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-200 disabled:opacity-50">Todo el día</button>
            </div>
            {(pickerStatus.morning || pickerStatus.afternoon) && (
              <button type="button" disabled={saving} onClick={() => void applyChoice(pickerDate, "clear")} className="mt-3 w-full rounded-lg border border-gray-300 bg-white py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Quitar no disponibilidad este día</button>
            )}
            <button type="button" disabled={saving} onClick={() => setPickerDate(null)} className="mt-4 w-full rounded-lg border-2 border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">{saving ? "Guardando…" : "Cancelar"}</button>
          </div>
        </div>
      )}
    </section>
  );
}
