import { NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { isRealDateOnly, madridDateOnly } from "@/lib/reservations/bookingPolicy";

export const dynamic = "force-dynamic";

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
  } catch (err) {
    console.error("[anesthetist-unavailability GET]", err instanceof Error ? err.message : "Unknown error");
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

    let body: unknown;
    try {
      body = await request.json();
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

    const reason = input.reason?.trim() || null;
    await prisma.$transaction(async (tx) => {
      const desired = new Set<"MORNING" | "AFTERNOON">();
      if (input.morning) desired.add("MORNING");
      if (input.afternoon) desired.add("AFTERNOON");

      for (const shift of ["MORNING", "AFTERNOON"] as const) {
        if (desired.has(shift)) {
          await tx.anesthetistUnavailability.upsert({
            where: { anesthetistId_date_shift: { anesthetistId: targetId, date: input.date, shift } },
            create: { anesthetistId: targetId, date: input.date, shift, reason },
            update: { reason },
          });
        } else {
          await tx.anesthetistUnavailability.deleteMany({
            where: { anesthetistId: targetId, date: input.date, shift },
          });
        }
      }

      await tx.userAuditEvent.create({
        data: {
          userId: targetId,
          actorUserId: session!.userId,
          eventType: "ANESTHETIST_UNAVAILABILITY_UPDATED",
          detailsJson: JSON.stringify({ date: input.date, morning: input.morning, afternoon: input.afternoon }),
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[anesthetist-unavailability PUT]", err instanceof Error ? err.message : "Unknown error");
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
