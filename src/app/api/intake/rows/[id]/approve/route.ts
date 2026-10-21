import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { canApproveIntakeRow, matchSurgeon } from "@/lib/intake/masterWorkbook";
import { createReservationInDb } from "@/lib/reservations/createReservationInDb";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = toAuthSession(await getSessionFromCookie());
  const denyAuth = requireAuth(session);
  if (denyAuth) return denyAuth;
  const deny = requirePermission(session!, "booking:create");
  if (deny) return deny;

  const { id } = await params;
  const row = await prisma.intakeRow.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Fila no encontrada" }, { status: 404 });
  if (row.reservationId) return NextResponse.json({ id: row.reservationId, status: "APPROVED" });
  if (!canApproveIntakeRow(row)) {
    return NextResponse.json({ error: "La fila no está lista para reservar. Revise turno, quirófano y nombre." }, { status: 409 });
  }

  const users = await prisma.user.findMany({
    where: { deletedAt: null, approved: true, role: { in: [UserRole.CIRUJANO, UserRole.ENDOSCOPISTA] } },
    select: { id: true, name: true },
  });
  const surgeon = matchSurgeon(row.surgeonName ?? "", users);
  if (!surgeon.ok) {
    return NextResponse.json({ error: "No hay un cirujano único para esta fila. No se ha creado la reserva." }, { status: 409 });
  }

  const created = await createReservationInDb({
    date: row.serviceDate,
    resourceId: row.resourceId as "Q1" | "Q2" | "Q3" | "procedimientos-menores" | "tecnicas-dolor",
    shift: row.shift as "morning" | "afternoon",
    slotIndex: row.slotIndex ?? 0,
    patients: [{
      historyNumber: row.historyNumber,
      fullName: row.patientName,
      procedure: row.procedure,
      estimatedDurationMinutes: row.minutes,
      anesthesiaType: "General",
      insuranceType: "SNS",
      admissionType: "ambulatorio",
      orderIndex: 0,
      isDeferredUrgency: false,
    }],
  }, surgeon.userId, { origin: "GESTOR", actorUserId: session!.userId });
  if (!created.ok) return NextResponse.json({ error: created.message, code: created.error }, { status: 409 });

  await prisma.intakeRow.update({
    where: { id },
    data: { status: "APPROVED", reservationId: created.reservationId },
  });
  return NextResponse.json({ id: created.reservationId, status: "APPROVED" });
}
