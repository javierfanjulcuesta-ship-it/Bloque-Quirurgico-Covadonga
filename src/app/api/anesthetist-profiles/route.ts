/**
 * Cupo de quirófanos simultáneos por anestesista.
 * GET no devuelve email ni hash. PUT persiste el número; el catálogo solo rellena si no hay fila.
 */

import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { readTextBodyWithLimit } from "@/lib/http/requestBody";
import { catalogMaxForName, effectiveMaxSimultaneousOr } from "@/lib/anesthesia/capacityCatalog";

export const dynamic = "force-dynamic";

const MAX_BODY = 8 * 1024;

function serialize(user: {
  id: string;
  name: string;
  anesthetistProfile: { maxSimultaneousOr: number } | null;
}) {
  const profileMax = user.anesthetistProfile?.maxSimultaneousOr ?? null;
  const catalogMax = catalogMaxForName(user.name);
  return {
    userId: user.id,
    name: user.name,
    maxSimultaneousOr: effectiveMaxSimultaneousOr(profileMax, user.name),
    profileMax,
    catalogMax,
    source: profileMax != null ? "profile" : catalogMax != null ? "catalog" : "default",
  };
}

export async function GET() {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;
    const deny = requirePermission(session!, "anesthetist:assign");
    if (deny) return deny;

    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        approved: true,
        role: { in: [UserRole.ANESTESISTA, UserRole.GESTOR_ANESTESISTA] },
      },
      select: { id: true, name: true, anesthetistProfile: { select: { maxSimultaneousOr: true } } },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ profiles: users.map(serialize) });
  } catch {
    console.error("[anesthetist-profiles GET] failed");
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;
    const deny = requirePermission(session!, "anesthetist:assign");
    if (deny) return deny;

    const limited = await readTextBodyWithLimit(request, MAX_BODY);
    if (!limited.ok) return NextResponse.json({ error: "Cuerpo demasiado grande" }, { status: 413 });
    let body: unknown;
    try {
      body = JSON.parse(limited.text);
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }
    const raw = body as { userId?: unknown; maxSimultaneousOr?: unknown };
    const userId = typeof raw.userId === "string" ? raw.userId.trim() : "";
    const max = raw.maxSimultaneousOr;
    if (!userId || typeof max !== "number" || !Number.isInteger(max) || max < 1 || max > 6) {
      return NextResponse.json({ error: "Indique un cupo entero entre 1 y 6." }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
        approved: true,
        role: { in: [UserRole.ANESTESISTA, UserRole.GESTOR_ANESTESISTA] },
      },
      select: { id: true, name: true },
    });
    if (!user) return NextResponse.json({ error: "Anestesista no encontrado" }, { status: 404 });

    const saved = await prisma.anesthetistProfile.upsert({
      where: { userId },
      create: { userId, maxSimultaneousOr: max, updatedByUserId: session!.userId },
      update: { maxSimultaneousOr: max, updatedByUserId: session!.userId },
      select: { maxSimultaneousOr: true },
    });
    return NextResponse.json({
      profile: serialize({ id: user.id, name: user.name, anesthetistProfile: saved }),
    });
  } catch {
    console.error("[anesthetist-profiles PUT] failed");
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
