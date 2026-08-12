import type { AuthSession, BookingLike } from "@/lib/auth/authorization";
import { canAccessBooking } from "@/lib/auth/authorization";
import { hasPermission } from "@/lib/auth/permissions";

export interface ReservationAccessLike extends BookingLike {
  /** Campo legacy; se mantiene durante la transición a AnesthetistAssignment. */
  anesthetistId?: string | null;
  /** Fuente canónica: asignaciones OR que cubren fecha/recurso/turno de la reserva. */
  assignedAnesthetistIds?: string[];
}

export type ReservationDetailAccess = "full" | "schedule-only" | "denied";

/**
 * Política única para el detalle de una reserva.
 *
 * - Gestión con booking:view:all: detalle completo.
 * - Cirujano/endoscopista propietario o creador autorizado: detalle completo.
 * - Anestesista asignado mediante AnesthetistAssignment (o campo legacy): solo agenda.
 * - Cualquier otro caso: denegado.
 */
export function getReservationDetailAccess(
  session: AuthSession | null,
  reservation: ReservationAccessLike,
): ReservationDetailAccess {
  if (!session?.userId) return "denied";

  if (hasPermission(session.role, "booking:view:all")) return "full";

  if (canAccessBooking(session, reservation, "booking:view:own")) return "full";

  const assigned =
    reservation.anesthetistId === session.userId ||
    reservation.assignedAnesthetistIds?.includes(session.userId) === true;

  if (hasPermission(session.role, "schedule:view:own") && assigned) {
    return "schedule-only";
  }

  return "denied";
}
