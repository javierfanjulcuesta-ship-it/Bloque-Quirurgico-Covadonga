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
import { fetchBlockPlans } from "@/lib/api/blockOpeningPlan";
import { hasGestorAccess, type BlockOpeningPlan, type ResourceId, type Shift, type SlotView } from "@/lib/types";
import { getSlots, toISODate } from "@/lib/utils";

type ExactStatus = "OPEN" | "CLOSED" | "URGENT_RESERVED";

type ExactSlotOverride = {
  date: string;
  resourceId: ResourceId;
  shift: Shift;
  slotIndex: number;
  status: ExactStatus;
  notes?: string | null;
  updatedAt?: string;
};

type ManagedSlot = Pick<ExactSlotOverride, "date" | "resourceId" | "shift" | "slotIndex">;

function slotKey(slot: ManagedSlot): string {
  return `${slot.resourceId}-${slot.date}-${slot.shift}-${slot.slotIndex}`;
}

function effectiveStatusFor(
  slot: ManagedSlot,
  exact: ExactSlotOverride[],
  coarsePlans: BlockOpeningPlan[],
): ExactStatus {
  const exactMatch = exact.find(
    (item) =>
      item.date === slot.date &&
      item.resourceId === slot.resourceId &&
      item.shift === slot.shift &&
      item.slotIndex === slot.slotIndex,
  );
  if (exactMatch) return exactMatch.status;
  const coarse = coarsePlans.find(
    (item) => item.date === slot.date && item.resourceId === slot.resourceId && item.shift === slot.shift,
  );
  return (coarse?.status ?? "OPEN") as ExactStatus;
}

function buildDayViews(
  date: string,
  exact: ExactSlotOverride[],
  coarsePlans: BlockOpeningPlan[],
): SlotView[] {
  const result: SlotView[] = [];
  for (const resource of RESOURCES) {
    for (const shift of ["morning", "afternoon"] as const) {
      getSlots(shift).forEach((_timeSlot, slotIndex) => {
        const managed: ManagedSlot = { date, resourceId: resource.id, shift, slotIndex };
        const status = effectiveStatusFor(managed, exact, coarsePlans);
        const blocked = status === "CLOSED" || status === "URGENT_RESERVED";
        result.push({
          ...managed,
          status: blocked ? "blocked" : "free",
          blockReason: status === "URGENT_RESERVED" ? "URGENT_RESERVED" : status === "CLOSED" ? "CLOSED" : undefined,
        });
      });
    }
  }
  return result;
}

async function fetchExactOverrides(date: string): Promise<ExactSlotOverride[]> {
  const params = new URLSearchParams({ dateFrom: date, dateTo: date });
  const response = await fetch(`/api/block-slot-opening-plan?${params.toString()}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error ?? "Error al cargar cierres por tramo");
  return Array.isArray((body as { slots?: unknown[] }).slots)
    ? ((body as { slots: ExactSlotOverride[] }).slots)
    : [];
}

async function saveExactOverrides(items: Array<ManagedSlot & { status: ExactStatus }>): Promise<void> {
  const response = await fetch("/api/block-slot-opening-plan", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slots: items }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error ?? "Error al guardar cierres por tramo");
}

function demoToExact(closures: DemoSlotClosure[]): ExactSlotOverride[] {
  return closures.map((closure) => ({ ...closure, status: "CLOSED" as const }));
}

export default function GestorCierresPage() {
  const router = useRouter();
  const { user, hydrated } = useAuth();
  const [date, setDate] = useState(() => toISODate(new Date()));
  const [exactOverrides, setExactOverrides] = useState<ExactSlotOverride[]>([]);
  const [coarsePlans, setCoarsePlans] = useState<BlockOpeningPlan[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (!hasGestorAccess(user.role)) router.replace("/calendario");
  }, [hydrated, user, router]);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      if (modoDemo) {
        setExactOverrides(demoToExact(getDemoSlotClosures()));
        setCoarsePlans([]);
        return;
      }
      const [exact, coarse] = await Promise.all([
        fetchExactOverrides(date),
        fetchBlockPlans({ dateFrom: date, dateTo: date }),
      ]);
      setExactOverrides(exact);
      setCoarsePlans(coarse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar disponibilidad");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hydrated || !user || !hasGestorAccess(user.role)) return;
    void refresh();
    // `date` is intentionally the reload boundary; DEMO never calls /api.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, hydrated, user?.id]);

  const dateObj = useMemo(() => new Date(`${date}T12:00:00`), [date]);
  const slotViews = useMemo(
    () => buildDayViews(date, exactOverrides, coarsePlans),
    [date, exactOverrides, coarsePlans],
  );
  const slotViewByKey = useMemo(
    () => new Map(slotViews.map((slot) => [slotKey(slot), slot])),
    [slotViews],
  );

  const selectedSlots = useMemo(() => {
    const result: ManagedSlot[] = [];
    for (const key of selectedKeys) {
      const slot = slotViewByKey.get(key);
      if (!slot || slot.status === "blocked") continue;
      result.push({ date: slot.date, resourceId: slot.resourceId, shift: slot.shift, slotIndex: slot.slotIndex });
    }
    return result;
  }, [selectedKeys, slotViewByKey]);

  const blockedSlots = useMemo(
    () => slotViews.filter((slot) => slot.status === "blocked"),
    [slotViews],
  );

  const handleSelect = (slot: SlotView) => {
    if (slot.status === "blocked") return;
    const key = slotKey(slot);
    setSelectedKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectWholeShift = (shift: Shift) => {
    const next = new Set<string>();
    for (const slot of slotViews) {
      if (slot.shift === shift && slot.status !== "blocked") next.add(slotKey(slot));
    }
    setSelectedKeys(next);
  };

  const selectResourceShift = (resourceId: ResourceId, shift: Shift) => {
    const next = new Set<string>();
    for (const slot of slotViews) {
      if (slot.resourceId === resourceId && slot.shift === shift && slot.status !== "blocked") {
        next.add(slotKey(slot));
      }
    }
    setSelectedKeys(next);
  };

  const applyStatus = async (status: "CLOSED" | "URGENT_RESERVED") => {
    if (selectedSlots.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (modoDemo) {
        // La DEMO solo persiste cierres ficticios locales. Nunca llama a /api.
        const next = closeDemoSlots(selectedSlots);
        setExactOverrides(demoToExact(next));
        setNotice(`${selectedSlots.length} tramo(s) cerrados en DEMO.`);
      } else {
        await saveExactOverrides(selectedSlots.map((slot) => ({ ...slot, status })));
        setNotice(
          status === "CLOSED"
            ? `${selectedSlots.length} tramo(s) cerrados.`
            : `${selectedSlots.length} tramo(s) reservados para urgencias.`,
        );
        await refresh();
      }
      setSelectedKeys(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const reopenSlots = async (slots: ManagedSlot[]) => {
    if (slots.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (modoDemo) {
        const next = reopenDemoSlots(slots);
        setExactOverrides(demoToExact(next));
      } else {
        await saveExactOverrides(slots.map((slot) => ({ ...slot, status: "OPEN" as const })));
        await refresh();
      }
      setSelectedKeys(new Set());
      setNotice(`${slots.length} tramo(s) reabiertos.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al reabrir");
    } finally {
      setSaving(false);
    }
  };

  if (!hydrated || !user || !hasGestorAccess(user.role)) return null;

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                {modoDemo ? "DEMO aislada · almacenamiento local" : "Gestión de apertura"}
              </p>
              <h1 className="text-xl font-bold text-[var(--ribera-navy)]">Cerrar / reabrir por tramo horario</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                Seleccione uno o varios tramos en la misma parrilla usada para programar. Puede actuar sobre una sala,
                varias salas o todo el turno. Un cierre exacto prevalece sobre el estado general del turno.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/calendario")}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
            >
              Volver al calendario
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-2">
            <label className="text-sm font-medium text-slate-700">
              Fecha
              <input
                type="date"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setSelectedKeys(new Set());
                  setNotice(null);
                }}
                className="ml-2 rounded border border-slate-300 px-2 py-1.5"
              />
            </label>
            <button type="button" onClick={() => selectWholeShift("morning")} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
              Toda la mañana
            </button>
            <button type="button" onClick={() => selectWholeShift("afternoon")} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
              Toda la tarde
            </button>
            <button type="button" onClick={() => setSelectedKeys(new Set())} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
              Limpiar selección
            </button>
            <button
              type="button"
              onClick={() => void applyStatus("CLOSED")}
              disabled={selectedSlots.length === 0 || saving}
              className="rounded bg-[var(--ribera-red)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cerrar selección ({selectedSlots.length})
            </button>
            {!modoDemo ? (
              <button
                type="button"
                onClick={() => void applyStatus("URGENT_RESERVED")}
                disabled={selectedSlots.length === 0 || saving}
                className="rounded border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reservar urgencias
              </button>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {RESOURCES.flatMap((resource) =>
              (["morning", "afternoon"] as const).map((shift) => (
                <button
                  key={`${resource.id}-${shift}`}
                  type="button"
                  onClick={() => selectResourceShift(resource.id, shift)}
                  className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  {resource.label} · {shift === "morning" ? "mañana" : "tarde"}
                </button>
              )),
            )}
          </div>

          {loading ? <p className="mt-3 text-sm text-slate-500">Cargando disponibilidad…</p> : null}
          {notice ? <p className="mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p> : null}
          {error ? <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
        </section>

        <DaySlotGrid
          date={dateObj}
          dateLabel={dateObj.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          allowedResources={RESOURCES}
          slotViews={slotViews}
          onSlotSelect={handleSelect}
          selectedSlotKeys={selectedKeys}
        />

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold text-[var(--ribera-navy)]">Tramos no disponibles este día</h2>
              <p className="text-xs text-slate-500">
                Incluye cierres y reservas de urgencias efectivas. Reabrir crea un override OPEN exacto cuando sea necesario.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void reopenSlots(blockedSlots)}
              disabled={blockedSlots.length === 0 || saving}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
            >
              Reabrir todos los tramos del día
            </button>
          </div>

          {blockedSlots.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No hay tramos cerrados o reservados para urgencias en esta fecha.</p>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {blockedSlots.map((slot) => {
                const time = getSlots(slot.shift)[slot.slotIndex];
                const resource = RESOURCES.find((item) => item.id === slot.resourceId)?.label ?? slot.resourceId;
                const label = slot.blockReason === "URGENT_RESERVED" ? "Urgencias" : "Cerrado";
                return (
                  <div key={slotKey(slot)} className="flex items-center justify-between gap-2 rounded border border-slate-200 p-2 text-sm">
                    <span>
                      {resource} · {slot.shift === "morning" ? "Mañana" : "Tarde"} · {time ? `${time.start}-${time.end}` : `tramo ${slot.slotIndex + 1}`} · {label}
                    </span>
                    <button
                      type="button"
                      onClick={() => void reopenSlots([slot])}
                      disabled={saving}
                      className="font-medium text-[var(--ribera-red)] hover:underline disabled:opacity-50"
                    >
                      Reabrir
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
