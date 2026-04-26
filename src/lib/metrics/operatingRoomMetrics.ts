import type { ResourceId, Shift, SlotView } from "@/lib/types";
import { getSlotDurationMinutes } from "@/lib/utils";

export interface OperatingRoomMetricsTotals {
  availableMinutes: number;
  programmedMinutes: number;
  reservedEmptyMinutes: number;
  freeSlotMinutes: number;
  intraBlockFreeMinutes: number;
  overflowMinutes: number;
  occupancyPercent: number | null;
}

export interface OperatingRoomMetricsRow extends OperatingRoomMetricsTotals {
  resourceId: ResourceId;
  resourceLabel: string;
  shift: Shift;
}

function slotCapMinutes(v: SlotView): number {
  if (v.totalMinutes != null && v.totalMinutes > 0) return v.totalMinutes;
  return getSlotDurationMinutes(v.shift, v.slotIndex);
}

function accumulateSlot(
  v: SlotView,
  acc: Omit<OperatingRoomMetricsTotals, "occupancyPercent">
): void {
  const cap = slotCapMinutes(v);
  if (v.status === "blocked") {
    return;
  }
  acc.availableMinutes += cap;

  if (v.status === "free") {
    acc.freeSlotMinutes += cap;
  } else if (v.status === "reserved") {
    acc.reservedEmptyMinutes += cap;
  } else if (v.status === "occupied") {
    const used = v.usedMinutes ?? 0;
    const free = v.freeMinutes ?? 0;
    if (v.isOverflowContinuation) {
      acc.overflowMinutes += used;
    } else {
      acc.programmedMinutes += used;
    }
    acc.intraBlockFreeMinutes += Math.max(0, free);
  }
}

function finalizeTotals(
  acc: Omit<OperatingRoomMetricsTotals, "occupancyPercent">
): OperatingRoomMetricsTotals {
  const occupancyPercent =
    acc.availableMinutes > 0 ? (acc.programmedMinutes / acc.availableMinutes) * 100 : null;
  return { ...acc, occupancyPercent };
}

const emptyAcc = (): Omit<OperatingRoomMetricsTotals, "occupancyPercent"> => ({
  availableMinutes: 0,
  programmedMinutes: 0,
  reservedEmptyMinutes: 0,
  freeSlotMinutes: 0,
  intraBlockFreeMinutes: 0,
  overflowMinutes: 0,
});

/** Agrega métricas de quirófano a partir de `slotViews` (misma salida que `buildSlotViews`). */
export function aggregateOperatingRoomMetrics(slotViews: SlotView[]): OperatingRoomMetricsTotals {
  const acc = emptyAcc();
  for (const v of slotViews) {
    accumulateSlot(v, acc);
  }
  return finalizeTotals(acc);
}

/**
 * Desglose por recurso y turno. Solo incluye filas para los recursos pasados (p. ej. filtrados por rol).
 */
export function breakdownByResourceAndShift(
  slotViews: SlotView[],
  resources: { id: ResourceId; label: string }[]
): OperatingRoomMetricsRow[] {
  const rows: OperatingRoomMetricsRow[] = [];
  const shifts: Shift[] = ["morning", "afternoon"];
  for (const r of resources) {
    for (const shift of shifts) {
      const acc = emptyAcc();
      for (const v of slotViews) {
        if (v.resourceId !== r.id || v.shift !== shift) continue;
        accumulateSlot(v, acc);
      }
      const totals = finalizeTotals(acc);
      rows.push({
        resourceId: r.id,
        resourceLabel: r.label,
        shift,
        ...totals,
      });
    }
  }
  return rows;
}
