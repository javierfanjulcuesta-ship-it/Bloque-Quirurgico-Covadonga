import { NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { readTextBodyWithLimit } from "@/lib/http/requestBody";
import { isRealDateOnly, madridDateOnly } from "@/lib/reservations/bookingPolicy";
import { replaceAnesthetistUnavailability } from "@/lib/anesthetistUnavailability";

export const dynamic = "force-dynamic";

const MAX_UNAVAILABILITY_BODY_BYTES = 16 * 1024;

const putSchema = z.object({
  date: z.string(),
  morning: z.boolean(),
  afternoon: z.boolean(),
  anesthetistId: z.string().trim().min(1).optional(),
  reason: z.string().trim().max(2000).nullable().optional(),
});

function roleNorm(role: string): string {
  return role.trim().toLowerCase().replace(/_/g, "-");
}

function canViewAll(role: string): boolean {
  const r = roleNorm(role);
  return r === "gestor" || r === "gestor-anestesista";
}

function canManageOwn(role: string): boolean {
  const r = roleNorm(role);
  return r === "anestesista" || r === "gestor-anestesista";
}

function toGrouped(rows: Array<{ anesthetistId: string; date: string; shift: "MORNING" | "AFTERNOON"; reason: string | null }>) {
  const map = new Map<string, { anesthetistId: string; date: string; morning: boolean; afternoon: boolean; reason: string | null }>();
  for (const row of rows) {
    const key = `${row.anesthetistId}|${row.date}`;
    const current = map.get(key) ?? {
      anesthetistId: row.anesthetistId,
      date: row.date,
      morning: false,
      afternoon: false,
      reason: row.reason,
    };
    if (row.shift === "MORNING") current.morning = true;
    else current.afternoon = true;
    if (!current.reason && row.reason) current.reason = row.reason;
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date) || a.anesthetistId.localeCompare(b.anesthetistId));
}

export async function GET(request: Request) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const deny = requireAuth(session);
    if (deny) return deny;

    const all = canViewAll(session!.role);
    const own = canManageOwn(session!.role);
    if (!all && !own) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const requestedId = searchParams.get("anesthetistId")?.trim() || undefined;
    const dateFrom = searchParams.get("dateFrom") || undefined;
    const dateTo = searchParams.get("dateTo") || undefined;

    if (dateFrom && !isRealDateOnly(dateFrom)) return NextResponse.json({ error: "dateFrom inválido" }, { status: 400 });
    if (dateTo && !isRealDateOnly(dateTo)) return NextResponse.json({ error: "dateTo inválido" }, { status: 400 });
    if (dateFrom && dateTo) {
      const days = (new Date(`${dateTo}T00:00:00.000Z`).getTime() - new Date(`${dateFrom}T00:00:00.000Z`).getTime()) / 86_400_000;
      if (days < 0 || days > 366) return NextResponse.json({ error: "Rango máximo 366 días" }, { status: 400 });
    }

    const anesthetistId = all ? requestedId : session!.userId;
    const rows = await prisma.anesthetistUnavailability.findMany({
      where: {
        ...(anesthetistId ? { anesthetistId } : {}),
        ...(dateFrom || dateTo
          ? { date: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } }
          : {}),
      },
      select: { anesthetistId: true, date: true, shift: true, reason: true },
      orderBy: [{ date: "asc" }, { anesthetistId: "asc" }, { shift: "asc" }],
    });

    return NextResponse.json({ unavailability: toGrouped(rows) });
  } catch {
    console.error("[anesthetist-unavailability GET] failed");
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const deny = requireAuth(session);
    if (deny) return deny;

    const all = canViewAll(session!.role);
    const own = canManageOwn(session!.role);
    if (!all && !own) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

    const limitedBody = await readTextBodyWithLimit(request, MAX_UNAVAILABILITY_BODY_BYTES);
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
    if (!parsed.success || !isRealDateOnly(parsed.success ? parsed.data.date : "")) {
      return NextResponse.json({ error: parsed.success ? "Fecha inválida" : parsed.error.errors[0]?.message ?? "Datos inválidos" }, { status: 400 });
    }

    const input = parsed.data;
    if (input.date < madridDateOnly()) {
      return NextResponse.json({ error: "No se puede modificar indisponibilidad de fechas pasadas" }, { status: 409 });
    }

    const targetId = all && input.anesthetistId ? input.anesthetistId : session!.userId;
    if (!all && input.anesthetistId && input.anesthetistId !== session!.userId) {
      return NextResponse.json({ error: "Solo puede modificar su propia indisponibilidad" }, { status: 403 });
    }

    const target = await prisma.user.findFirst({
      where: {
        id: targetId,
        approved: true,
        deletedAt: null,
        role: { in: [UserRole.ANESTESISTA, UserRole.GESTOR_ANESTESISTA] },
      },
      select: { id: true },
    });
    if (!target) return NextResponse.json({ error: "Anestesista no válido o inactivo" }, { status: 400 });

    await replaceAnesthetistUnavailability(prisma, {
      anesthetistId: targetId,
      actorUserId: session!.userId,
      date: input.date,
      morning: input.morning,
      afternoon: input.afternoon,
      reason: input.reason?.trim() || null,
    });

    return NextResponse.json({ ok: true });
  } catch {
    console.error("[anesthetist-unavailability PUT] failed");
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
