"use client";

/**
 * Vista de un solo día: filas = rangos horarios, columnas = recursos.
 * El usuario ve el estado de cada recurso (libre/reservado/ocupado) por tramo.
 */

import { getSlots, toISODate } from "@/lib/utils";
import type { SlotView, Shift } from "@/lib/types";
import { SlotCell } from "./SlotCell";
import { useEffect, useRef, useState } from "react";

function slotViewKey(v: SlotView): string {
  return `${v.resourceId}-${v.date}-${v.shift}-${v.slotIndex}`;
}

interface DaySlotGridProps {
  date: Date;
  dateLabel: string;
  allowedResources: { id: string; label: string }[];
  slotViews: SlotView[];
  onSlotSelect?: (slot: SlotView) => void;
  selectedSlotKeys?: Set<string>;
}

export function DaySlotGrid({
  date,
  dateLabel,
  allowedResources,
  slotViews,
  onSlotSelect,
  selectedSlotKeys,
}: DaySlotGridProps) {
  const dateStr = toISODate(date);
  const morningSlots = getSlots("morning");
  const afternoonSlots = getSlots("afternoon");

  const getSlotView = (
    resourceId: string,
    shift: Shift,
    slotIndex: number
  ): SlotView | undefined =>
    slotViews.find(
      (v) =>
        v.resourceId === resourceId &&
        v.date === dateStr &&
        v.shift === shift &&
        v.slotIndex === slotIndex
    );

  const [dragSelecting, setDragSelecting] = useState(false);
  const draggedKeysRef = useRef<Set<string>>(new Set());
  const suppressClickRef = useRef(false);

  useEffect(() => {
    if (!dragSelecting) return;
    const endDrag = () => {
      setDragSelecting(false);
      draggedKeysRef.current.clear();
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    };
    window.addEventListener("mouseup", endDrag);
    return () => window.removeEventListener("mouseup", endDrag);
  }, [dragSelecting]);

  const dragStart = (slot: SlotView) => {
    if (!onSlotSelect) return;
    const key = slotViewKey(slot);
    setDragSelecting(true);
    suppressClickRef.current = true;
    draggedKeysRef.current.clear();
    draggedKeysRef.current.add(key);
    onSlotSelect(slot);
  };

  const dragEnter = (slot: SlotView) => {
    if (!onSlotSelect || !dragSelecting) return;
    const key = slotViewKey(slot);
    if (draggedKeysRef.current.has(key)) return;
    draggedKeysRef.current.add(key);
    onSlotSelect(slot);
  };

  const dragEnd = () => {
    if (!dragSelecting) return;
    setDragSelecting(false);
    draggedKeysRef.current.clear();
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  const renderRow = (
    shift: Shift,
    slotIndex: number,
    timeLabel: string
  ) => {
    return (
      <tr key={`${shift}-${slotIndex}`} className="border-b border-gray-100">
        <td className="whitespace-nowrap border-r border-gray-100 p-2 text-sm font-medium text-gray-700">
          {timeLabel}
        </td>
        {allowedResources.map((res) => {
          const view = getSlotView(res.id, shift, slotIndex);
          if (!view) return <td key={res.id} className="p-1" />;
          return (
            <td key={res.id} className="align-middle p-1">
              <SlotCell
                slot={view}
                showDetails={false}
                onSelect={(slot) => {
                  if (suppressClickRef.current) return;
                  onSlotSelect?.(slot);
                }}
                compact={true}
                selected={selectedSlotKeys?.has(slotViewKey(view))}
                assignedToMe={view.assignedToAnesthetist}
                onDragStartSelect={dragStart}
                onDragEnterSelect={dragEnter}
                onDragEndSelect={dragEnd}
              />
            </td>
          );
        })}
      </tr>
    );
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-2.5">
        <h3 className="font-semibold tracking-tight text-[var(--ribera-navy)]">{dateLabel}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[400px] w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="p-2 text-sm font-semibold text-slate-700">Horario</th>
              {allowedResources.map((res) => (
                <th key={res.id} className="p-2 text-sm font-semibold text-slate-700">
                  {res.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="bg-amber-50/60">
              <td colSpan={allowedResources.length + 1} className="p-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-900">
                Mañana
              </td>
            </tr>
            {morningSlots.map((ts, i) => renderRow("morning", i, `${ts.start}-${ts.end}`))}
            <tr aria-hidden className="bg-slate-100/80">
              <td colSpan={allowedResources.length + 1} className="h-2 p-0" />
            </tr>
            <tr className="bg-slate-100/70">
              <td colSpan={allowedResources.length + 1} className="py-1.5 pl-2 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                Tarde
              </td>
            </tr>
            {afternoonSlots.map((ts, i) => renderRow("afternoon", i, `${ts.start}-${ts.end}`))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-2">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
          <li className="flex items-center gap-1.5"><span className="inline-block h-3 w-6 rounded border border-emerald-200 bg-[var(--slot-free)]" /> Libre</li>
          <li className="flex items-center gap-1.5"><span className="inline-block h-3 w-6 rounded border border-amber-300 bg-[var(--slot-reserved)]" /> Reserva vacía</li>
          <li className="flex items-center gap-1.5"><span className="inline-block h-3 w-6 rounded border border-amber-300 bg-[repeating-linear-gradient(45deg,rgba(251,191,36,0.24)_0,rgba(251,191,36,0.24)_6px,rgba(251,191,36,0.08)_6px,rgba(251,191,36,0.08)_12px)]" /> Reservado disponible</li>
          <li className="flex items-center gap-1.5"><span className="inline-block h-3 w-6 rounded border border-slate-200 bg-[var(--slot-occupied)]" /> Ocupado</li>
          <li className="flex items-center gap-1.5"><span className="inline-block h-3 w-6 rounded border border-gray-400 bg-gray-200" /> Cerrado/Urgencias</li>
          <li className="flex items-center gap-1.5"><span className="inline-block h-3 w-6 rounded border border-orange-300 bg-[var(--slot-private)]" /> Privado</li>
          <li className="flex items-center gap-1.5"><span className="inline-block h-3 w-6 rounded border border-rose-400 bg-rose-100" /> SESPA</li>
        </ul>
      </div>
    </div>
  );
}
