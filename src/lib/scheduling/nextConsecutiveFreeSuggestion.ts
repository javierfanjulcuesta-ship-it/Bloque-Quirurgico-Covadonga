export interface ConsecutiveRangeSuggestion {
  startSlotIndex: number;
  endSlotIndex: number;
}

export function findNextConsecutiveRangeBySlots(params: {
  startAfterSlotIndex: number;
  maxSlotIndex: number;
  requiredSlots: number;
  isSlotFree: (slotIndex: number) => boolean;
}): ConsecutiveRangeSuggestion | null {
  const { startAfterSlotIndex, maxSlotIndex, requiredSlots, isSlotFree } = params;
  if (requiredSlots <= 0) return null;
  for (let start = startAfterSlotIndex + 1; start <= maxSlotIndex; start++) {
    if (!isSlotFree(start)) continue;
    const end = start + requiredSlots - 1;
    if (end > maxSlotIndex) return null;
    let ok = true;
    for (let i = start; i <= end; i++) {
      if (!isSlotFree(i)) {
        ok = false;
        break;
      }
    }
    if (ok) return { startSlotIndex: start, endSlotIndex: end };
  }
  return null;
}

export function findNextConsecutiveRangeByMinutes(params: {
  startAfterSlotIndex: number;
  maxSlotIndex: number;
  requiredMinutes: number;
  isSlotFree: (slotIndex: number) => boolean;
  getSlotMinutes: (slotIndex: number) => number;
}): ConsecutiveRangeSuggestion | null {
  const { startAfterSlotIndex, maxSlotIndex, requiredMinutes, isSlotFree, getSlotMinutes } = params;
  if (requiredMinutes <= 0) return null;
  for (let start = startAfterSlotIndex + 1; start <= maxSlotIndex; start++) {
    if (!isSlotFree(start)) continue;
    let acc = 0;
    let end = start - 1;
    for (let i = start; i <= maxSlotIndex; i++) {
      if (!isSlotFree(i)) break;
      acc += getSlotMinutes(i);
      end = i;
      if (acc >= requiredMinutes) return { startSlotIndex: start, endSlotIndex: end };
    }
  }
  return null;
}
