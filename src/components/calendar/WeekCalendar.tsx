"use client";

/**
 * Calendario semanal: recursos (quirófanos, procedimientos menores, técnicas del dolor) x días, con tramos mañana/tarde.
 */

import { useMemo } from "react";
import { getWeekDays, getSlots, isToday } from "@/lib/utils";
import { RESOURCES } from "@/lib/constants";
import type { ResourceId, SlotView, Shift } from "@/lib/types";
import { SlotCell } from "./SlotCell";
import { WeekNavigation } from "./WeekNavigation";

export function assignmentSlotKey(resourceId: string, dateStr: string, shift: Shift): string {
  return `${resourceId}-${dateStr}-${shift}`;
}

interface WeekCalendarProps {
  weekStart: Date;
  onWeekChange: (newStart: Date) => void;
  slotViews: SlotView[];
  showDetails?: boolean;
  onSlotSelect?: (slot: SlotView) => void;
  canScheduleNextWeek?: boolean;
  compact?: boolean;
  assignedSlotKeys?: Set<string>;
  onDayHeaderClick?: (date: Date) => void;
  /** Si se indica, solo se muestran estos recursos (p. ej. cirujano solo Q1–Q3). */
  allowedResourceIds?: ResourceId[];
}

export function WeekCalendar({
  weekStart,
  onWeekChange,
  slotViews,
  showDetails = false,
  onSlotSelect,
  canScheduleNextWeek = true,
  compact = false,
  assignedSlotKeys,
  onDayHeaderClick,
  allowedResourceIds,
}: WeekCalendarProps) {
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const morningSlots = getSlots("morning");
  const afternoonSlots = getSlots("afternoon");
  const resources = useMemo(
    () =>
      allowedResourceIds?.length
        ? RESOURCES.filter((r) => allowedResourceIds.includes(r.id))
        : RESOURCES,
    [allowedResourceIds]
  );

  const getSlotView = (
    resourceId: SlotView["resourceId"],
    dateStr: string,
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

  return (
    <div className="space-y-4">
      <WeekNavigation
        weekStart={weekStart}
        onWeekChange={onWeekChange}
        canGoNext={canScheduleNextWeek}
      />

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-[800px] w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-200 bg-ribera-gray-light">
              <th className="p-2 font-semibold text-gray-700">Recurso</th>
              {weekDays.map((d) => (
                <th
                  key={d.toISOString()}
                  className={`p-2 font-semibold text-gray-700 ${isToday(d) ? "bg-ribera-red-soft" : ""} ${onDayHeaderClick ? "cursor-pointer select-none rounded hover:bg-ribera-red/10" : ""}`}
                  onClick={onDayHeaderClick ? () => onDayHeaderClick(new Date(d)) : undefined}
                  role={onDayHeaderClick ? "button" : undefined}
                >
                  {d.toLocaleDateString("es-ES", { weekday: "short" })}
                  <br />
                  <span className="text-xs font-normal">
                    {d.getDate()}/{d.getMonth() + 1}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resources.map((resource) => (
              <tr key={resource.id} className="border-b border-gray-100">
                <td className="border-r border-gray-100 p-2 font-medium text-gray-700">
                  {resource.label}
                </td>
                {weekDays.map((day) => {
                  const dateStr = day.toISOString().slice(0, 10);
                  return (
                    <td key={dateStr} className="align-top p-1">
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-gray-600">
                          Mañana
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {morningSlots.map((timeSlot, i) => {
                            const view = getSlotView(
                              resource.id,
                              dateStr,
                              "morning",
                              i
                            );
                            if (!view) return null;
                            const timeLabel = `${timeSlot.start}-${timeSlot.end}`;
                            return (
                              <SlotCell
                                key={`m-${i}`}
                                slot={view}
                                timeLabel={timeLabel}
                                showDetails={showDetails}
                                onSelect={onSlotSelect}
                                compact={compact}
                                assignedToMe={assignedSlotKeys?.has(assignmentSlotKey(resource.id, dateStr, "morning"))}
                              />
                            );
                          })}
                        </div>
                        <div className="pt-2 text-xs font-semibold text-gray-600">
                          Tarde
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {afternoonSlots.map((timeSlot, i) => {
                            const view = getSlotView(
                              resource.id,
                              dateStr,
                              "afternoon",
                              i
                            );
                            if (!view) return null;
                            const timeLabel = `${timeSlot.start}-${timeSlot.end}`;
                            return (
                              <SlotCell
                                key={`a-${i}`}
                                slot={view}
                                timeLabel={timeLabel}
                                showDetails={showDetails}
                                onSelect={onSlotSelect}
                                compact={compact}
                                assignedToMe={assignedSlotKeys?.has(assignmentSlotKey(resource.id, dateStr, "afternoon"))}
                              />
                            );
                          })}
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
