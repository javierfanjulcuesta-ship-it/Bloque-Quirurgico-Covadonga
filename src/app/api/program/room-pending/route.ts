/**
 * Solicitudes cuya sala no se reconoció. Solo lectura para el gestor.
 * No incluyen el cuerpo del correo ni teléfonos de paciente.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;
    const denyPerm = requirePermission(session!, "booking:view:all");
    if (denyPerm) return denyPerm;

    const rows = await prisma.emailMessage.findMany({
      where: {
        processingStatus: "PENDING",
        resultMessage: { contains: "no se asigna Q1" },
      },
      select: {
        id: true,
        subject: true,
        fromName: true,
        receivedAt: true,
        resultMessage: true,
      },
      orderBy: { receivedAt: "desc" },
      take: 50,
    });

    return NextResponse.json({
      pending: rows.map((row) => ({
        id: row.id,
        label: row.subject?.trim() || row.fromName?.trim() || "Solicitud sin quirófano",
        date: row.receivedAt.toISOString().slice(0, 10),
        detail: row.resultMessage ?? "Sala no reconocida. Queda pendiente, sin asignar Q1.",
      })),
    });
  } catch {
    console.error("[program/room-pending GET] failed");
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
