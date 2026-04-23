import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { RESOURCES } from "@/lib/constants";
import { logReservationEvent } from "@/lib/reservations/logReservationEvent";
import { findNextConsecutiveRangeBySlots } from "@/lib/scheduling/nextConsecutiveFreeSuggestion";
import { inferImportSlotSpan } from "@/lib/importPlanning/slotSpanHeuristics";

export type Funding = "SESPA" | "Privado" | "Mutua" | "Mixto" | "Desconocido";
export type ImportShift = "morning" | "afternoon" | "unknown";

export interface ImportableBlock {
  id: string;
  day: string;
  shift: ImportShift;
  resourceId: string;
  preferredSlotIndex?: number;
  surgeonName: string;
  sourceText: string;
  funding: Funding;
  source: "excel" | "pdf";
  inferredProcedures?: string[];
  inferredSlotSpan?: number;
}

export interface ImportConflict {
  blockId: string;
  reason:
    | "invalid_day"
    | "invalid_shift"
    | "invalid_resource"
    | "invalid_surgeon"
    | "slot_conflict_existing"
    | "slot_conflict_batch"
    | "database_error";
  detail: string;
  dateIso?: string;
  shift?: "morning" | "afternoon";
  resourceId?: string;
  originalSlotIndex?: number;
  suggestedSlotIndex?: number;
}

interface PlannedSlot {
  block: ImportableBlock;
  surgeonId: string;
  surgeonName: string;
  externalSurgeonName?: string;
  dateIso: string;
  slotStartIndex: number;
  slotSpan: number;
}

export interface RunImportPlanningResult {
  requested: number;
  ready: number;
  imported: number;
  conflicts: ImportConflict[];
  importedRows: Array<{ blockId: string; reservationId: string; date: string; shift: string; resourceId: string; slotIndex: number }>;
}

function maxSlotIndexForShift(shift: "morning" | "afternoon"): number {
  return shift === "morning" ? 5 : 4;
}

function toIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function resolveDayOffset(day: string): number | null {
  const n = normalize(day);
  if (n === "lunes") return 0;
  if (n === "martes") return 1;
  if (n === "miercoles") return 2;
  if (n === "jueves") return 3;
  if (n === "viernes") return 4;
  return null;
}

function insuranceTypeFromFunding(funding: Funding): string {
  if (funding === "SESPA") return "SESPA";
  if (funding === "Privado") return "Privado";
  if (funding === "Mutua") return "Mutua";
  if (funding === "Mixto") return "Mixto";
  return "Desconocido";
}

function normalizeSurgeonName(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function isReasonableSurgeonName(value: string | undefined): boolean {
  const normalized = normalizeSurgeonName(value);
  if (!normalized) return false;
  const simplified = normalize(normalized);
  if (!simplified) return false;
  if (simplified === "sin asignar" || simplified === "sinasignar" || simplified === "no asignado" || simplified === "desconocido") return false;
  if (simplified.length < 3) return false;
  return true;
}

export async function runImportPlanning(params: {
  weekStart: Date;
  blocks: ImportableBlock[];
  actorUserId: string;
  dryRun: boolean;
}): Promise<RunImportPlanningResult> {
  const { weekStart, blocks, actorUserId, dryRun } = params;
  const validResourceIds = new Set(RESOURCES.map((r) => r.id));
  const slotCounters = new Map<string, number>();
  const batchSlots = new Set<string>();
  const conflicts: ImportConflict[] = [];
  const planned: PlannedSlot[] = [];
  const importedRows: RunImportPlanningResult["importedRows"] = [];
  const occupiedSlotsByKey = new Map<string, Set<number>>();

  const getOccupiedSlots = async (
    dateIso: string,
    shift: "morning" | "afternoon",
    resourceId: string
  ): Promise<Set<number>> => {
    const cacheKey = `${dateIso}-${shift}-${resourceId}`;
    const cached = occupiedSlotsByKey.get(cacheKey);
    if (cached) return cached;
    const rows = await prisma.reservation.findMany({
      where: {
        date: new Date(`${dateIso}T00:00:00.000Z`),
        shift: shift === "morning" ? "MORNING" : "AFTERNOON",
        resourceId,
        status: { in: ["PENDING", "CONFIRMED"] },
      },
      select: { slotIndex: true },
    });
    const result = new Set(rows.map((r) => r.slotIndex));
    occupiedSlotsByKey.set(cacheKey, result);
    return result;
  };

  for (const block of blocks) {
    const dayOffset = resolveDayOffset(block.day);
    if (dayOffset === null) {
      conflicts.push({ blockId: block.id, reason: "invalid_day", detail: "Dia no valido para importacion." });
      continue;
    }
    if (block.shift !== "morning" && block.shift !== "afternoon") {
      conflicts.push({ blockId: block.id, reason: "invalid_shift", detail: "Turno no valido para importacion." });
      continue;
    }
    if (!validResourceIds.has(block.resourceId as (typeof RESOURCES)[number]["id"])) {
      conflicts.push({ blockId: block.id, reason: "invalid_resource", detail: "Recurso no valido para importacion." });
      continue;
    }

    const normalizedInputSurgeon = normalizeSurgeonName(block.surgeonName);
    const surgeon = normalizedInputSurgeon
      ? await prisma.user.findFirst({
          where: {
            approved: true,
            deletedAt: null,
            role: { in: [UserRole.CIRUJANO, UserRole.ENDOSCOPISTA] },
            name: normalizedInputSurgeon,
          },
          select: { id: true, name: true },
        })
      : null;
    const manualSurgeonName = isReasonableSurgeonName(normalizedInputSurgeon) ? normalizedInputSurgeon : undefined;
    if (!surgeon && !manualSurgeonName) {
      conflicts.push({
        blockId: block.id,
        reason: "invalid_surgeon",
        detail: "Bloque sin cirujano reconocido ni nombre manual.",
      });
      continue;
    }

    const target = new Date(weekStart);
    target.setUTCDate(weekStart.getUTCDate() + dayOffset);
    const dateIso = toIsoDate(target);
    const slotKeyBase = `${dateIso}-${block.shift}-${block.resourceId}`;
    const slotSpan = inferImportSlotSpan({
      shift: block.shift,
      inferredProcedures: block.inferredProcedures,
      sourceText: block.sourceText,
      explicitSpan: block.inferredSlotSpan,
    });
    const nextAutoSlot = slotCounters.get(slotKeyBase) ?? 0;
    const slotIndex = Number.isInteger(block.preferredSlotIndex) ? (block.preferredSlotIndex as number) : nextAutoSlot;
    slotCounters.set(slotKeyBase, Math.max(nextAutoSlot, slotIndex + slotSpan));
    const maxSlot = maxSlotIndexForShift(block.shift);
    if (slotIndex + slotSpan - 1 > maxSlot) {
      conflicts.push({
        blockId: block.id,
        reason: "slot_conflict_batch",
        detail: `No hay huecos consecutivos suficientes (necesita ${slotSpan}).`,
        dateIso,
        shift: block.shift,
        resourceId: block.resourceId,
        originalSlotIndex: slotIndex,
      });
      continue;
    }

    const hasBatchConflict = Array.from({ length: slotSpan }).some((_, i) =>
      batchSlots.has(`${slotKeyBase}-${slotIndex + i}`)
    );
    if (hasBatchConflict) {
      conflicts.push({
        blockId: block.id,
        reason: "slot_conflict_batch",
        detail: `Dos bloques válidos chocan en el rango solicitado (${slotIndex}-${slotIndex + slotSpan - 1}).`,
        dateIso,
        shift: block.shift,
        resourceId: block.resourceId,
        originalSlotIndex: slotIndex,
      });
      continue;
    }

    const occupied = await getOccupiedSlots(dateIso, block.shift, block.resourceId);
    const hasOccupiedInRange = Array.from({ length: slotSpan }).some((_, i) => occupied.has(slotIndex + i));
    if (hasOccupiedInRange) {
      const suggestion = findNextConsecutiveRangeBySlots({
        startAfterSlotIndex: slotIndex,
        maxSlotIndex: maxSlot,
        requiredSlots: slotSpan,
        isSlotFree: (i) => {
          const unique = `${slotKeyBase}-${i}`;
          return !occupied.has(i) && !batchSlots.has(unique);
        },
      });
      conflicts.push({
        blockId: block.id,
        reason: "slot_conflict_existing",
        detail: `Rango ocupado (${dateIso}, ${block.shift}, ${block.resourceId}, slots ${slotIndex}-${slotIndex + slotSpan - 1}).`,
        dateIso,
        shift: block.shift,
        resourceId: block.resourceId,
        originalSlotIndex: slotIndex,
        suggestedSlotIndex: suggestion?.startSlotIndex ?? undefined,
      });
      continue;
    }

    for (let i = 0; i < slotSpan; i++) {
      batchSlots.add(`${slotKeyBase}-${slotIndex + i}`);
    }
    planned.push({
      block,
      surgeonId: surgeon?.id ?? actorUserId,
      surgeonName: surgeon?.name ?? "Nombre libre (importado)",
      externalSurgeonName: surgeon ? undefined : manualSurgeonName,
      dateIso,
      slotStartIndex: slotIndex,
      slotSpan,
    });
  }

  if (!dryRun) {
    for (const p of planned) {
      const procedureText =
        p.block.inferredProcedures?.[0]?.trim() || p.block.sourceText.trim().slice(0, 120) || "Pendiente de detallar";
      const pseudoHistory = `IMP-${Date.now().toString().slice(-6)}-${p.slotStartIndex}`;
      try {
        for (let i = 0; i < p.slotSpan; i++) {
          const currentSlotIndex = p.slotStartIndex + i;
          const created = await prisma.reservation.create({
            data: {
              date: new Date(`${p.dateIso}T00:00:00.000Z`),
              resourceId: p.block.resourceId,
              shift: p.block.shift === "morning" ? "MORNING" : "AFTERNOON",
              slotIndex: currentSlotIndex,
              surgeonId: p.surgeonId,
              externalSurgeonName: p.externalSurgeonName ?? null,
              status: i === 0 ? "CONFIRMED" : "PENDING",
              origin: "GESTOR",
              createdByUserId: actorUserId,
              updatedByUserId: actorUserId,
              patients: i === 0
                ? {
                    create: [
                      {
                        historyNumber: pseudoHistory,
                        fullName: null,
                        procedure: procedureText,
                        estimatedDurationMinutes: 60,
                        anesthesiaType: "Pendiente de revisar (importado)",
                        insuranceType: insuranceTypeFromFunding(p.block.funding),
                        admissionType: null,
                        orderIndex: 0,
                        notes: `[IMPORTADO ${p.block.source.toUpperCase()}] ${p.block.sourceText}`.slice(0, 500),
                        solicitudRecursos: null,
                      },
                    ],
                  }
                : undefined,
            },
            select: { id: true },
          });

          importedRows.push({
            blockId: p.block.id,
            reservationId: created.id,
            date: p.dateIso,
            shift: p.block.shift,
            resourceId: p.block.resourceId,
            slotIndex: currentSlotIndex,
          });

          await logReservationEvent({
            eventType: "RESERVATION_CREATED",
            reservationId: created.id,
            actorUserId,
            origin: "gestor",
            detailsJson: {
              imported: true,
              importBlockId: p.block.id,
              importSource: p.block.source,
              importFunding: p.block.funding,
              rawText: p.block.sourceText,
              assignedSurgeonName: p.surgeonName,
              externalSurgeonName: p.externalSurgeonName ?? null,
              inferredSlotSpan: p.slotSpan,
              heuristicDuration: true,
              slotInImportedRange: i,
            },
          });
        }
      } catch (err) {
        conflicts.push({
          blockId: p.block.id,
          reason: "database_error",
          detail: err instanceof Error ? err.message : "Error desconocido al crear reserva.",
          dateIso: p.dateIso,
          shift: p.block.shift as "morning" | "afternoon",
          resourceId: p.block.resourceId,
          originalSlotIndex: p.slotStartIndex,
        });
      }
    }
  }

  for (const c of conflicts) {
    if (c.reason === "slot_conflict_existing") {
      await logReservationEvent({
        eventType: "RESERVATION_REJECTED_CONFLICT",
        actorUserId,
        origin: "gestor",
        detailsJson: {
          importBlockId: c.blockId,
          reason: c.reason,
          detail: c.detail,
          dryRun,
        },
      });
    }
  }

  return {
    requested: blocks.length,
    ready: planned.length,
    imported: importedRows.length,
    conflicts,
    importedRows,
  };
}

