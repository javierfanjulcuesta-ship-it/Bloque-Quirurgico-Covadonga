/**
 * Overrides exactos de apertura por tramo horario.
 * GET - lista overrides persistidos en un rango acotado.
 * PUT - aplica atómicamente un lote de OPEN/CLOSED/URGENT_RESERVED a slots exactos.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requireAnyPermission, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { readTextBodyWithLimit } from "@/lib/http/requestBody";
import { RESOURCES } from "@/lib/constants";
import { acquireSchedulingContextLock } from "@/lib/reservations/bookingContextLock";
import { getSlots } from "@/lib/utils";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_BATCH_SLOTS = 250;
const RESOURCE_IDS = RESOURCES.map((r) => r.id) as [string, ...string[]];
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)");
const slotSchema = z.object({
  date: dateSchema,
  resourceId: z.enum(RESOURCE_IDS),
  shift: z.enum(["morning", "afternoon"]),
  slotIndex: z.number().int().min(0),
  status: z.enum(["OPEN", "CLOSED", "URGENT_RESERVED"]),
  notes: z.string().trim().max(1000).nullable().optional(),
});
const putSchema = z.object({
  slots: z.array(slotSchema).min(1).max(MAX_BATCH_SLOTS),
});

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function shiftToDb(shift: "morning" | "afternoon"): "MORNING" | "AFTERNOON" {
  return shift === "morning" ? "MORNING" : "AFTERNOON";
}

function shiftFromDb(shift: "MORNING" | "AFTERNOON"): "morning" | "afternoon" {
  return shift === "MORNING" ? "morning" : "afternoon";
}

function contextKey(item: { date: string; resourceId: string; shift: "morning" | "afternoon" }): string {
  return `${item.date}|${item.resourceId}|${item.shift}`;
}

export async function GET(request: Request) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requireAnyPermission(session!, ["schedule:view:own", "schedule:view:all"]);
    if (denyPerm) return denyPerm;

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    if (!dateFrom || !dateTo || !isValidDateOnly(dateFrom) || !isValidDateOnly(dateTo)) {
      return NextResponse.json({ error: "dateFrom y dateTo válidos (YYYY-MM-DD) son requeridos" }, { status: 400 });
    }

    const from = new Date(`${dateFrom}T00:00:00.000Z`);
    const to = new Date(`${dateTo}T23:59:59.999Z`);
    const rangeMs = to.getTime() - from.getTime();
    if (rangeMs < 0 || rangeMs > 93 * 86_400_000) {
      return NextResponse.json({ error: "Rango máximo 93 días" }, { status: 400 });
    }

    const rows = await prisma.blockSlotOpeningPlan.findMany({
      where: { date: { gte: from, lte: to } },
      orderBy: [{ date: "asc" }, { resourceId: "asc" }, { shift: "asc" }, { slotIndex: "asc" }],
    });

    return NextResponse.json({
      slots: rows.map((row) => ({
        date: row.date.toISOString().slice(0, 10),
        resourceId: row.resourceId,
        shift: shiftFromDb(row.shift),
        slotIndex: row.slotIndex,
        status: row.status,
        notes: row.notes ?? null,
        updatedAt: row.updatedAt.toISOString(),
      })),
    });
  } catch {
    console.error("[block-slot-opening-plan GET] failed");
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requirePermission(session!, "or:open_close");
    if (denyPerm) return denyPerm;

    const limitedBody = await readTextBodyWithLimit(request, MAX_BODY_BYTES);
    if (!limitedBody.ok) {
      return NextResponse.json({ error: "Cuerpo demasiado grande" }, { status: 413 });
    }

    let body: unknown;
    try {
      body = JSON.parse(limitedBody.text);
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }

    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Datos inválidos" }, { status: 400 });
    }

    const deduped = new Map<string, (typeof parsed.data.slots)[number]>();
    for (const item of parsed.data.slots) {
      if (!isValidDateOnly(item.date)) {
        return NextResponse.json({ error: `Fecha inválida: ${item.date}` }, { status: 400 });
      }
      if (item.slotIndex >= getSlots(item.shift).length) {
        return NextResponse.json({ error: `slotIndex fuera de rango para ${item.shift}` }, { status: 400 });
      }
      const key = `${contextKey(item)}|${item.slotIndex}`;
      deduped.set(key, item);
    }
    const items = [...deduped.values()];

    const contexts = [...new Map(items.map((item) => [contextKey(item), {
      date: item.date,
      resourceId: item.resourceId,
      shift: item.shift,
    }])).values()].sort((a, b) => contextKey(a).localeCompare(contextKey(b)));

    const saved = await prisma.$transaction(async (tx) => {
      // Orden estable de locks para que dos lotes solapados no puedan crear un deadlock.
      for (const context of contexts) {
        await acquireSchedulingContextLock(tx, context);
      }

      const result = [];
      for (const item of items) {
        const date = new Date(`${item.date}T00:00:00.000Z`);
        const shift = shiftToDb(item.shift);
        const row = await tx.blockSlotOpeningPlan.upsert({
          where: {
            date_resourceId_shift_slotIndex: {
              date,
              resourceId: item.resourceId,
              shift,
              slotIndex: item.slotIndex,
            },
          },
          create: {
            date,
            resourceId: item.resourceId,
            shift,
            slotIndex: item.slotIndex,
            status: item.status,
            notes: item.notes ?? null,
            approvedByUserId: session!.userId,
          },
          update: {
            status: item.status,
            notes: item.notes ?? null,
            approvedByUserId: session!.userId,
          },
        });
        result.push(row);
      }
      return result;
    }, { maxWait: 5_000, timeout: 15_000 });

    return NextResponse.json({
      updated: saved.length,
      slots: saved.map((row) => ({
        date: row.date.toISOString().slice(0, 10),
        resourceId: row.resourceId,
        shift: shiftFromDb(row.shift),
        slotIndex: row.slotIndex,
        status: row.status,
        notes: row.notes ?? null,
        updatedAt: row.updatedAt.toISOString(),
      })),
    });
  } catch {
    console.error("[block-slot-opening-plan PUT] failed");
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
