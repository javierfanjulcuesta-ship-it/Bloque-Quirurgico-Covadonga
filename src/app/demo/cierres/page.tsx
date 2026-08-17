"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DaySlotGrid } from "@/components/calendar/DaySlotGrid";
import { useAuth } from "@/context/AuthContext";
import { RESOURCES } from "@/lib/constants";
import { modoDemo } from "@/lib/config";
import {
  closeDemoSlots,
  getDemoSlotClosures,
  reopenDemoSlots,
  type DemoSlotClosure,
} from "@/lib/demoBlockClosures";
import { hasGestorAccess, type Shift, type SlotView } from "@/lib/types";
import { getSlots, toISODate } from "@/lib/utils";

function slotKey(slot: Pick<DemoSlotClosure, "date" | "resourceId" | "shift" | "slotIndex">): string {
  return `${slot.resourceId}-${slot.date}-${slot.shift}-${slot.slotIndex}`;
}

function buildDayViews(date: string, closures: DemoSlotClosure[]): SlotView[] {
  const closed = new Set(closures.map(slotKey));
  const result: SlotView[] = [];
  for (const resource of RESOURCES) {
    for (const shift of ["morning", "afternoon"] as const) {
      getSlots(shift).forEach((_slot, slotIndex) => {
        const key = `${resource.id}-${date}-${shift}-${slotIndex}`;
        const isClosed = closed.has(key);
        result.push({
          resourceId: resource.id,
          date,
          shift,
          slotIndex,
          status: isClosed ? "blocked" : "free",
          blockReason: isClosed ? "CLOSED" : undefined,
        });
      });
    }
  }
  return result;
}

export default function DemoCierresPage() {
  const router = useRouter();
  const { user, hydrated } = useAuth();
  const [date, setDate] = useState(() => toISODate(new Date()));
  const [closures, setClosures] = useState<DemoSlotClosure[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!modoDemo) return;
    setClosures(getDemoSlotClosures());
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (!hasGestorAccess(user.role)) {
      router.replace("/calendario");
    }
  }, [hydrated, user, router]);

  const dateObj = useMemo(() => new Date(`${date}T12:00:00`), [date]);
  const slotViews = useMemo(() => buildDayViews(date, closures), [date, closures]);
  const closuresForDay = useMemo(
    () => closures.filter((c) => c.date === date).sort((a, b) => a.shift.localeCompare(b.shift) || a.slotIndex - b.slotIndex || a.resourceId.localeCompare(b.resourceId)),
    [closures, date],
  );

  const handleSelect = (slot: SlotView) => {
    if (slot.status === "blocked") return;
    const key = slotKey(slot);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectedClosures = useMemo(() => {
    const result: DemoSlotClosure[] = [];
    for (const resource of RESOURCES) {
      for (const shift of ["morning", "afternoon"] as const) {
        getSlots(shift).forEach((_slot, slotIndex) => {
          const item: DemoSlotClosure = { date, resourceId: resource.id, shift, slotIndex };
          if (selectedKeys.has(slotKey(item))) result.push(item);
        });
      }
    }
    return result;
  }, [date, selectedKeys]);

  const selectWholeShift = (shift: Shift) => {
    const next = new Set<string>();
    const closed = new Set(closures.map(slotKey));
    for (const resource of RESOURCES) {
      getSlots(shift).forEach((_slot, slotIndex) => {
        const item: DemoSlotClosure = { date, resourceId: resource.id, shift, slotIndex };
        const key = slotKey(item);
        if (!closed.has(key)) next.add(key);
      });
    }
    setSelectedKeys(next);
  };

  const closeSelection = () => {
    if (selectedClosures.length === 0) return;
    const next = closeDemoSlots(selectedClosures);
    setClosures(next);
    setSelectedKeys(new Set());
    setNotice(`${selectedClosures.length} tramo(s) cerrados en DEMO.`);
  };

  const reopenOne = (closure: DemoSlotClosure) => {
    setClosures(reopenDemoSlots([closure]));
    setNotice("Tramo reabierto en DEMO.");
  };

  const reopenDay = () => {
    if (closuresForDay.length === 0) return;
    setClosures(reopenDemoSlots(closuresForDay));
    setSelectedKeys(new Set());
    setNotice("Todos los cierres del día se han reabierto en DEMO.");
  };

  if (!modoDemo) {
    return <div className="p-6 text-sm text-slate-600">Esta superficie solo está disponible en modo demostración aislado.</div>;
  }

  if (!hydrated || !user || !hasGestorAccess(user.role)) return null;

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">DEMO aislada</p>
              <h1 className="text-xl font-bold text-[var(--ribera-navy)]">Cerrar / reabrir disponibilidad</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                Seleccione tramos en la misma parrilla horaria utilizada para reservar. Puede cerrar horas concretas,
                varias salas o un turno completo. Estos cierres son ficticios y se guardan solo en este navegador.
              </p>
            </div>
            <button type="button" onClick={() => router.push("/calendario")} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
              Volver al calendario
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-2">
            <label className="text-sm font-medium text-slate-700">
              Fecha
              <input
                type="date"
                value={date}
                onChange={(e) => { setDate(e.target.value); setSelectedKeys(new Set()); setNotice(null); }}
                className="ml-2 rounded border border-slate-300 px-2 py-1.5"
              />
            </label>
            <button type="button" onClick={() => selectWholeShift("morning")} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
              Seleccionar toda la mañana
            </button>
            <button type="button" onClick={() => selectWholeShift("afternoon")} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
              Seleccionar toda la tarde
            </button>
            <button type="button" onClick={() => setSelectedKeys(new Set())} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
              Limpiar selección
            </button>
            <button
              type="button"
              onClick={closeSelection}
              disabled={selectedClosures.length === 0}
              className="rounded bg-[var(--ribera-red)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cerrar selección ({selectedClosures.length})
            </button>
          </div>

          {notice && <p className="mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
        </div>

        <DaySlotGrid
          date={dateObj}
          dateLabel={dateObj.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          allowedResources={RESOURCES}
          slotViews={slotViews}
          onSlotSelect={handleSelect}
          selectedSlotKeys={selectedKeys}
        />

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold text-[var(--ribera-navy)]">Tramos cerrados este día</h2>
              <p className="text-xs text-slate-500">Los tramos cerrados aparecen en gris en la parrilla.</p>
            </div>
            <button
              type="button"
              onClick={reopenDay}
              disabled={closuresForDay.length === 0}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
            >
              Reabrir todos los cierres del día
            </button>
          </div>

          {closuresForDay.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No hay cierres DEMO para esta fecha.</p>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {closuresForDay.map((closure) => {
                const time = getSlots(closure.shift)[closure.slotIndex];
                const resource = RESOURCES.find((r) => r.id === closure.resourceId)?.label ?? closure.resourceId;
                return (
                  <div key={slotKey(closure)} className="flex items-center justify-between gap-2 rounded border border-slate-200 p-2 text-sm">
                    <span>{resource} · {closure.shift === "morning" ? "Mañana" : "Tarde"} · {time ? `${time.start}-${time.end}` : `tramo ${closure.slotIndex + 1}`}</span>
                    <button type="button" onClick={() => reopenOne(closure)} className="font-medium text-[var(--ribera-red)] hover:underline">Reabrir</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
