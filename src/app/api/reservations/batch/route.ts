import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { createReservationBatchSchema } from "@/lib/validations/reservation";
import { createReservationBatchInDb } from "@/lib/reservations/createReservationBatchInDb";
import { toApiReservation } from "@/lib/reservations/reservationApiHelpers";

export const dynamic = "force-dynamic";

const RESERVATION_SELECT = {
  id: true,
  date: true,
  resourceId: true,
  shift: true,
  slotIndex: true,
  surgeonId: true,
  externalSurgeonName: true,
  status: true,
  anesthetistId: true,
  createdByUserId: true,
  createdAt: true,
  patients: {
    select: {
      id: true,
      historyNumber: true,
      fullName: true,
      procedure: true,
      estimatedDurationMinutes: true,
      anesthesiaType: true,
      insuranceType: true,
      admissionType: true,
      orderIndex: true,
      notes: true,
      solicitudRecursos: true,
    },
  },
} as const;

export async function POST(request: Request) {
  const session = toAuthSession(await getSessionFromCookie());
  const denyAuth = requireAuth(session);
  if (denyAuth) return denyAuth;

  const denyPerm = requirePermission(session!, "booking:create");
  if (denyPerm) return denyPerm;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }

  const raw = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const { surgeonId: rawSurgeonId, externalSurgeonName: rawExternalSurgeonName, ...batchFields } = raw;
  const parsed = createReservationBatchSchema.safeParse(batchFields);
  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message ?? "Datos inválidos";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const responsibleSurgeonFromBody =
    typeof rawSurgeonId === "string" && rawSurgeonId.trim().length > 0 ? rawSurgeonId.trim() : undefined;
  const externalSurgeonName =
    typeof rawExternalSurgeonName === "string" && rawExternalSurgeonName.trim().length > 0
      ? rawExternalSurgeonName.trim()
      : undefined;

  const roleNorm = session!.role?.trim().toLowerCase().replace(/_/g, "-") ?? "";
  const isCoordinator = roleNorm === "gestor" || roleNorm === "gestor-anestesista";

  let effectiveSurgeonId = session!.userId;
  if (isCoordinator) {
    if (!responsibleSurgeonFromBody && !externalSurgeonName) {
      return NextResponse.json(
        { error: "Debe indicar un cirujano responsable (surgeonId) o escribir un nombre libre." },
        { status: 400 }
      );
    }
    if (responsibleSurgeonFromBody) {
      const surgeonUser = await prisma.user.findFirst({
        where: {
          id: responsibleSurgeonFromBody,
          approved: true,
          deletedAt: null,
          role: { in: [UserRole.CIRUJANO, UserRole.ENDOSCOPISTA] },
        },
        select: { id: true },
      });
      if (!surgeonUser) {
        return NextResponse.json(
          { error: "El cirujano responsable no es válido, no está aprobado o no tiene perfil cirujano/endoscopista." },
          { status: 400 }
        );
      }
      effectiveSurgeonId = surgeonUser.id;
    } else {
      effectiveSurgeonId = session!.userId;
    }
  }

  const result = await createReservationBatchInDb(parsed.data, effectiveSurgeonId, {
    origin: isCoordinator ? "GESTOR" : "APP",
    actorUserId: session!.userId,
    externalSurgeonName,
    isBatchCreation: parsed.data.isBatchCreation === true,
  });

  if (!result.ok) {
    if (result.error === "slot_occupied") {
      return NextResponse.json(
        { error: "No se pudo crear el bloque completo. No se ha guardado ningún cambio." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: result.message ?? "Datos inválidos" }, { status: 400 });
  }

  const reservations = await prisma.reservation.findMany({
    where: { id: { in: result.reservationIds } },
    select: RESERVATION_SELECT,
    orderBy: [{ date: "asc" }, { shift: "asc" }, { slotIndex: "asc" }],
  });

  return NextResponse.json({
    ok: true,
    reservations: reservations.map((r) => toApiReservation(r as Parameters<typeof toApiReservation>[0])),
  });
}
