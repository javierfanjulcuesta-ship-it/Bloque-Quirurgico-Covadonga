/**
 * Registra eventos del ciclo de vida de reservas para analítica.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export type ReservationEventType =
  | "RESERVATION_CREATED"
  | "RESERVATION_CREATED_FROM_EMAIL"
  | "RESERVATION_UPDATED"
  | "RESERVATION_CANCELLED"
  | "RESERVATION_RELEASED"
  | "AUTO_RELEASE_TO_COMMON_POOL"
  | "RESERVATION_REJECTED_CONFLICT"
  | "RESERVATION_PATIENT_UPDATED"
  | "RESERVATION_PATIENT_REPLACED"
  | "RESERVATION_PATIENT_CANCELLED"
  | "PATIENT_WORKFLOW_STARTED"
  | "PREANESTHESIA_PENDING"
  | "PATIENT_NOTIFICATION_DRY_RUN_CREATED"
  | "ADMIN_NOTIFICATION_DRY_RUN_CREATED"
  | "ADMIN_NOTIFICATION_SKIPPED_NO_EMAIL"
  | "PATIENT_SURGICAL_CIRCUIT_SUSPENDED"
  | "PREANESTHESIA_APPOINTMENT_ASSIGNED"
  | "DEFERRED_URGENCY_CREATED"
  | "PREANESTHESIA_NO_SLOT_AVAILABLE";

export type ReservationEventOrigin = "app" | "email" | "gestor";

export interface LogReservationEventParams {
  eventType: ReservationEventType;
  reservationId?: string | null;
  actorUserId?: string | null;
  origin?: ReservationEventOrigin | null;
  detailsJson?: Record<string, unknown> | null;
}

type ReservationEventDb = PrismaClient | Prisma.TransactionClient;

/**
 * Escritura estricta de auditoría. A diferencia de logReservationEvent, propaga
 * cualquier error para que el llamador pueda incluir el evento en su transacción
 * y hacer rollback de la mutación principal si la trazabilidad no persiste.
 */
export async function writeReservationEvent(
  db: ReservationEventDb,
  params: LogReservationEventParams,
): Promise<void> {
  await db.reservationEvent.create({
    data: {
      reservationId: params.reservationId ?? null,
      eventType: params.eventType,
      actorUserId: params.actorUserId ?? null,
      origin: params.origin ?? null,
      detailsJson: params.detailsJson ? JSON.stringify(params.detailsJson) : null,
    },
  });
}

/** Registra un evento best-effort para flujos no críticos/analíticos. */
export async function logReservationEvent(params: LogReservationEventParams): Promise<void> {
  try {
    await writeReservationEvent(prisma, params);
  } catch (err) {
    console.error("[logReservationEvent]", err instanceof Error ? err.message : "Unknown error");
  }
}
