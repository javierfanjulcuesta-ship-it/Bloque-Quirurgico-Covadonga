"use client";

/**
 * Vista de un solo día: filas = rangos horarios, columnas = recursos.
 * El usuario ve el estado de cada recurso (libre/reservado/ocupado) por tramo.
 */

import { getSlots, toISODate } from "@/lib/utils";
import type { SlotView, Shift } from "@/lib/types";
import { SlotCell } from "./SlotCell";

function slotViewKey(v: SlotView): string {
  return `${v.resourceId}-${v.date}-${v.shift}-${v.slotIndex}`;
}

interface DaySlotGridProps {
  date: Date;
  dateLabel: string;
  allowedResources: { id: SlotView["resourceId"]; label: string }[];
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
    resourceId: SlotView["resourceId"],
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
                onSelect={onSlotSelect}
                compact={true}
                selected={selectedSlotKeys?.has(slotViewKey(view))}
              />
            </td>
          );
        })}
      </tr>
    );
  };

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 bg-ribera-gray-light px-4 py-2">
        <h3 className="font-semibold text-gray-800">{dateLabel}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[400px] w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="p-2 text-sm font-semibold text-gray-700">Horario</th>
              {allowedResources.map((res) => (
                <th key={res.id} className="p-2 text-sm font-semibold text-gray-700">
                  {res.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="bg-amber-50/50">
              <td colSpan={allowedResources.length + 1} className="p-1.5 text-xs font-semibold text-amber-800">
                Mañana
              </td>
            </tr>
            {morningSlots.map((ts, i) => renderRow("morning", i, `${ts.start}-${ts.end}`))}
            <tr aria-hidden className="bg-gray-100/80">
              <td colSpan={allowedResources.length + 1} className="h-2 p-0" />
            </tr>
            <tr className="bg-slate-100/70">
              <td colSpan={allowedResources.length + 1} className="py-1.5 pl-2 text-xs font-semibold text-slate-700">
                Tarde
              </td>
            </tr>
            {afternoonSlots.map((ts, i) => renderRow("afternoon", i, `${ts.start}-${ts.end}`))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500">
        <span className="mr-2 inline-block"><span className="inline-block h-3 w-10 align-middle rounded border border-emerald-200 bg-[var(--slot-free)]" /> Libre</span>
        <span className="mr-2 inline-block"><span className="inline-block h-3 w-10 align-middle rounded border border-amber-300 bg-[var(--slot-reserved)]" /> Reservado (su reserva)</span>
        <span className="inline-block"><span className="inline-block h-3 w-10 align-middle rounded border border-red-200 bg-[var(--slot-occupied)]" /> Ocupado / Sus pacientes</span>. Pulse en libre para reservar; en reservado o en sus pacientes para programar o ver datos.
      </p>
    </div>
  );
}
