/**
 * GET /api/common-pool-releases
 * Últimas liberaciones a la bolsa común. Solo lectura para CIRUJANO/ENDOSCOPISTA.
 * Devuelve fecha, turno, recurso y fecha de liberación.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, hasPermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export interface ReleasedSlotPublic {
  date: string;
  shift: string;
  resourceId: string;
  resourceLabel: string;
  releasedAt: string;
}

const RESOURCE_LABELS: Record<string, string> = {
  Q1: "Q1",
  Q2: "Q2",
  Q3: "Q3",
  "procedimientos-menores": "Procedimientos menores",
  "tecnicas-dolor": "Técnicas del dolor",
};

export async function GET(request: Request) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const canView = hasPermission(session!.role, "booking:view:own") || hasPermission(session!.role, "booking:view:all");
    if (!canView) {
      return NextResponse.json({ error: "Sin acceso a esta información" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 100);

    const logs = await prisma.releaseNotificationLog.findMany({
      where: { releasedCount: { gt: 0 } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { slotDetailsJson: true, createdAt: true },
    });

    const slots: ReleasedSlotPublic[] = [];
    const seen = new Set<string>();
    for (const log of logs) {
      try {
        const details = JSON.parse(log.slotDetailsJson) as Array<{ date: string; shift: string; resourceId: string }>;
        const releasedAt = log.createdAt.toISOString();
        for (const d of details) {
          const key = `${d.date}-${d.shift}-${d.resourceId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          slots.push({
            date: d.date,
            shift: d.shift === "morning" ? "Mañana" : "Tarde",
            resourceId: d.resourceId,
            resourceLabel: RESOURCE_LABELS[d.resourceId] ?? d.resourceId,
            releasedAt,
          });
          if (slots.length >= limit) break;
        }
      } catch {
        // skip invalid json
      }
      if (slots.length >= limit) break;
    }

    return NextResponse.json({ releases: slots });
  } catch (err) {
    console.error("[common-pool-releases GET]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
