import type { ResourceId, Shift, SlotView } from "@/lib/types";
import { safeParseJSON } from "@/lib/storageSafe";

const STORAGE_KEY = "bloque_quirurgico_demo_slot_closures_v1";

export interface DemoSlotClosure {
  date: string;
  resourceId: ResourceId;
  shift: Shift;
  slotIndex: number;
}

function keyOf(c: DemoSlotClosure): string {
  return `${c.date}|${c.resourceId}|${c.shift}|${c.slotIndex}`;
}

export function getDemoSlotClosures(): DemoSlotClosure[] {
  if (typeof window === "undefined") return [];
  const raw = safeParseJSON<unknown>(localStorage.getItem(STORAGE_KEY), []);
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is DemoSlotClosure => {
    if (!item || typeof item !== "object") return false;
    const o = item as Record<string, unknown>;
    return (
      typeof o.date === "string" &&
      typeof o.resourceId === "string" &&
      (o.shift === "morning" || o.shift === "afternoon") &&
      Number.isInteger(o.slotIndex) &&
      (o.slotIndex as number) >= 0
    );
  });
}

function writeDemoSlotClosures(closures: DemoSlotClosure[]): void {
  if (typeof window === "undefined") return;
  const deduped = Array.from(new Map(closures.map((c) => [keyOf(c), c])).values());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
}

export function isDemoSlotClosed(slot: DemoSlotClosure): boolean {
  const target = keyOf(slot);
  return getDemoSlotClosures().some((closure) => keyOf(closure) === target);
}

export function closeDemoSlots(slots: DemoSlotClosure[]): DemoSlotClosure[] {
  const merged = [...getDemoSlotClosures(), ...slots];
  writeDemoSlotClosures(merged);
  return getDemoSlotClosures();
}

export function reopenDemoSlots(slots: DemoSlotClosure[]): DemoSlotClosure[] {
  const remove = new Set(slots.map(keyOf));
  const next = getDemoSlotClosures().filter((c) => !remove.has(keyOf(c)));
  writeDemoSlotClosures(next);
  return next;
}

export function clearDemoSlotClosures(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function applyDemoClosuresToSlotViews(
  slotViews: SlotView[],
  closures: DemoSlotClosure[],
): SlotView[] {
  const closed = new Set(closures.map(keyOf));
  return slotViews.map((slot) =>
    closed.has(keyOf(slot))
      ? { ...slot, status: "blocked" as const, blockReason: "CLOSED" as const }
      : slot,
  );
}

export const DEMO_SLOT_CLOSURES_STORAGE_KEY = STORAGE_KEY;
