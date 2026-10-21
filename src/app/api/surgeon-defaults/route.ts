/**
 * Turno y quirófano habitual. Editable por quien tiene rules:edit.
 * No crea reservas.
 */

import { NextResponse } from "next/server";
import { Shift, UserRole } from "@prisma/client";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { readTextBodyWithLimit } from "@/lib/http/requestBody";
import { suggestSurgeonHabit, type HabitShift } from "@/lib/surgeons/habits";
import { recognizeResourceId } from "@/lib/program/recognizeResource";

export const dynamic = "force-dynamic";

const MAX_BODY = 8 * 1024;
const KNOWN = new Set(["Q1", "Q2", "Q3", "procedimientos-menores", "tecnicas-dolor", "endoscopias"]);

function toShift(value: Shift | null | undefined): HabitShift | null {
  if (value === "MORNING") return "morning";
  if (value === "AFTERNOON") return "afternoon";
  return null;
}

export async function GET() {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;
    const deny = requirePermission(session!, "rules:edit");
    if (deny) return deny;

    const users = await prisma.user.findMany({
      where: { deletedAt: null, approved: true, role: { in: [UserRole.CIRUJANO, UserRole.ENDOSCOPISTA] } },
      select: {
        id: true,
        name: true,
        surgeonDefault: { select: { defaultShift: true, preferredResourceId: true, active: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      defaults: users.map((user) => {
        const saved = user.surgeonDefault
          ? {
              defaultShift: toShift(user.surgeonDefault.defaultShift),
              preferredResourceId: user.surgeonDefault.preferredResourceId,
              active: user.surgeonDefault.active,
            }
          : null;
        const suggestion = suggestSurgeonHabit({ surgeonName: user.name, saved });
        return {
          userId: user.id,
          name: user.name,
          saved,
          suggestion,
          source: saved?.active ? "profile" : suggestion.flags.length > 0 ? "catalog" : "none",
        };
      }),
    });
  } catch {
    console.error("[surgeon-defaults GET] failed");
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;
    const deny = requirePermission(session!, "rules:edit");
    if (deny) return deny;

    const limited = await readTextBodyWithLimit(request, MAX_BODY);
    if (!limited.ok) return NextResponse.json({ error: "Cuerpo demasiado grande" }, { status: 413 });
    let body: unknown;
    try {
      body = JSON.parse(limited.text);
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }
    const raw = body as {
      userId?: unknown;
      defaultShift?: unknown;
      preferredResourceId?: unknown;
      active?: unknown;
    };
    const userId = typeof raw.userId === "string" ? raw.userId.trim() : "";
    const shift = raw.defaultShift === "morning" || raw.defaultShift === "afternoon" || raw.defaultShift === null
      ? raw.defaultShift
      : undefined;
    const resource = raw.preferredResourceId === null
      ? null
      : typeof raw.preferredResourceId === "string"
        ? raw.preferredResourceId.trim()
        : undefined;
    if (!userId || shift === undefined || resource === undefined) {
      return NextResponse.json({ error: "Datos de hábito incompletos" }, { status: 400 });
    }
    if (resource && (!recognizeResourceId(resource) && !KNOWN.has(resource))) {
      return NextResponse.json({ error: "Quirófano habitual no reconocido" }, { status: 400 });
    }
    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null, role: { in: [UserRole.CIRUJANO, UserRole.ENDOSCOPISTA] } },
      select: { id: true },
    });
    if (!user) return NextResponse.json({ error: "Cirujano no encontrado" }, { status: 404 });

    await prisma.surgeonDefault.upsert({
      where: { userId },
      create: {
        userId,
        defaultShift: shift === "morning" ? Shift.MORNING : shift === "afternoon" ? Shift.AFTERNOON : null,
        preferredResourceId: resource,
        active: raw.active !== false,
        updatedByUserId: session!.userId,
      },
      update: {
        defaultShift: shift === "morning" ? Shift.MORNING : shift === "afternoon" ? Shift.AFTERNOON : null,
        preferredResourceId: resource,
        active: raw.active !== false,
        updatedByUserId: session!.userId,
      },
    });
    return NextResponse.json({ ok: true });
  } catch {
    console.error("[surgeon-defaults PUT] failed");
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
