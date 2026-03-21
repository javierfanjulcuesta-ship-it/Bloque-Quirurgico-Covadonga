/**
 * Planes de apertura del bloque.
 * GET - Listar planes (schedule:view:own | schedule:view:all). Rango max 93 días.
 * PUT - Crear/actualizar plan (or:open_close, solo gestores)
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission, requireAnyPermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { RESOURCES } from "@/lib/constants";
import type { BlockOpeningStatus } from "@/lib/types";

const VALID_RESOURCE_IDS = new Set(RESOURCES.map((r) => r.id));

function toApiPlan(r: {
  id: string;
  date: Date;
  shift: string;
  resourceId: string;
  status: string;
  minRequiredMinutes: number;
  reservedUrgentMinutes: number;
  notes: string | null;
  approvedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const dateStr = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);
  return {
    id: r.id,
    date: dateStr,
    shift: r.shift === "MORNING" ? "morning" : "afternoon",
    resourceId: r.resourceId,
    status: r.status,
    minRequiredMinutes: r.minRequiredMinutes,
    reservedUrgentMinutes: r.reservedUrgentMinutes,
    notes: r.notes ?? undefined,
    approvedByUserId: r.approvedByUserId ?? undefined,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Ver planes de apertura (agenda). Requiere schedule:view:own o schedule:view:all. */
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
    if (!dateFrom || !dateTo) {
      return NextResponse.json({ error: "dateFrom y dateTo requeridos" }, { status: 400 });
    }

    const from = new Date(dateFrom + "T00:00:00.000Z");
    const to = new Date(dateTo + "T23:59:59.999Z");

    // Límite: max 93 días para evitar consultas pesadas
    const maxDays = 93;
    const diffMs = to.getTime() - from.getTime();
    if (diffMs < 0 || diffMs > maxDays * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: `Rango máximo ${maxDays} días` }, { status: 400 });
    }

    const plans = await prisma.blockOpeningPlan.findMany({
      where: { date: { gte: from, lte: to } },
      select: {
        id: true,
        date: true,
        shift: true,
        resourceId: true,
        status: true,
        minRequiredMinutes: true,
        reservedUrgentMinutes: true,
        notes: true,
        approvedByUserId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ date: "asc" }, { resourceId: "asc" }, { shift: "asc" }],
    });

    return NextResponse.json({
      plans: plans.map(toApiPlan),
    });
  } catch (err) {
    console.error("[block-opening-plan GET]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

const VALID_STATUSES: BlockOpeningStatus[] = ["OPEN", "CLOSED", "URGENT_RESERVED"];

export async function PUT(request: Request) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requirePermission(session!, "or:open_close");
    if (denyPerm) return denyPerm;

    const body = await request.json();
    const {
      date,
      resourceId,
      shift,
      status,
      minRequiredMinutes,
      reservedUrgentMinutes,
      notes,
    } = body;

    if (
      typeof date !== "string" ||
      typeof resourceId !== "string" ||
      !["morning", "afternoon"].includes(shift)
    ) {
      return NextResponse.json({ error: "date, resourceId y shift requeridos" }, { status: 400 });
    }

    if (!VALID_RESOURCE_IDS.has(resourceId)) {
      return NextResponse.json(
        { error: `resourceId inválido. Valores permitidos: ${[...VALID_RESOURCE_IDS].join(", ")}` },
        { status: 400 }
      );
    }

    const statusVal = status && VALID_STATUSES.includes(status) ? status : "OPEN";
    const minReq = typeof minRequiredMinutes === "number" ? Math.max(0, minRequiredMinutes) : 0;
    const reservedUrgent = typeof reservedUrgentMinutes === "number" ? Math.max(0, reservedUrgentMinutes) : 0;
    const notesVal = typeof notes === "string" ? notes : null;

    const dateObj = new Date(date + "T00:00:00.000Z");
    const shiftEnum = shift === "morning" ? "MORNING" : "AFTERNOON";

    const plan = await prisma.blockOpeningPlan.upsert({
      where: {
        date_resourceId_shift: { date: dateObj, resourceId, shift: shiftEnum },
      },
      create: {
        date: dateObj,
        resourceId,
        shift: shiftEnum,
        status: statusVal,
        minRequiredMinutes: minReq,
        reservedUrgentMinutes: reservedUrgent,
        notes: notesVal,
        approvedByUserId: session!.userId,
      },
      update: {
        status: statusVal,
        minRequiredMinutes: minReq,
        reservedUrgentMinutes: reservedUrgent,
        notes: notesVal,
        approvedByUserId: session!.userId,
      },
    });

    return NextResponse.json({
      plan: toApiPlan(plan),
    });
  } catch (err) {
    console.error("[block-opening-plan PUT]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
