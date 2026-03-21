/**
 * Capa de autorización: require* y control de acceso por recurso (IDOR).
 * Usar siempre en backend. Respuestas 401/403 estándar.
 */

import { NextResponse } from "next/server";
import type { SessionPayload } from "./session";
import {
  type Permission,
  type Role,
  normalizeRole,
  hasPermission,
  hasAnyPermission,
} from "./permissions";

/** Payload mínimo de sesión para autorización. */
export interface AuthSession {
  userId: string;
  role: string;
}

/** Convierte SessionPayload a AuthSession. */
export function toAuthSession(payload: SessionPayload | null): AuthSession | null {
  if (!payload?.userId || !payload?.role) return null;
  return { userId: payload.userId, role: payload.role };
}

/** Resultado: acceso denegado con NextResponse o null (permitido). */
export type DenyResult = NextResponse | null;

/**
 * Exige sesión autenticada. Si no, devuelve 401.
 * Uso: const deny = requireAuth(session); if (deny) return deny;
 */
export function requireAuth(session: AuthSession | null): DenyResult {
  if (!session?.userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  return null;
}

/**
 * Exige que el rol esté entre los permitidos. Devuelve 403 si no.
 */
export function requireRole(
  session: AuthSession | null,
  allowedRoles: Role[]
): DenyResult {
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const role = normalizeRole(session.role);
  if (!role || !allowedRoles.includes(role)) {
    return NextResponse.json(
      { error: "No tiene permisos para esta acción" },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Exige un permiso. Devuelve 403 si no lo tiene.
 */
export function requirePermission(
  session: AuthSession | null,
  permission: Permission
): DenyResult {
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!hasPermission(session.role, permission)) {
    return NextResponse.json(
      { error: "No tiene permisos para esta acción" },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Exige al menos uno de los permisos.
 */
export function requireAnyPermission(
  session: AuthSession | null,
  permissions: Permission[]
): DenyResult {
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!hasAnyPermission(session.role, permissions)) {
    return NextResponse.json(
      { error: "No tiene permisos para esta acción" },
      { status: 403 }
    );
  }
  return null;
}

// --- Recursos (interfaces mínimas, compatibles con Prisma) ---

/** Reserva: tiene surgeonId para ownership. */
export interface BookingLike {
  id: string;
  surgeonId: string;
  /** Si fue creada por un gestor en nombre de otro */
  createdByUserId?: string | null;
}

/** Programación: (date, shift, resourceId) + anesthetistId si aplica. */
export interface ScheduleLike {
  date: string;
  shift: string;
  resourceId: string;
  anesthetistId?: string | null;
}

/** Paciente: vinculado a reserva (surgeonId) o anesthetistId. */
export interface PatientLike {
  id: string;
  reservationId: string;
  /** Via reserva: surgeonId. Se resuelve en canAccessBooking. */
}

/**
 * ¿Puede el usuario acceder a esta reserva?
 * - booking:view:all → sí
 * - booking:view:own + (surgeonId o createdByUserId) = userId → sí
 * - booking:update/cancel: mismo criterio
 */
export function canAccessBooking(
  session: AuthSession | null,
  booking: BookingLike,
  requiredPermission: "booking:view:all" | "booking:view:own" | "booking:update" | "booking:cancel" = "booking:view:own"
): boolean {
  if (!session?.userId) return false;

  const hasAll = hasPermission(session.role, "booking:view:all");
  if (requiredPermission === "booking:view:all" || requiredPermission === "booking:view:own") {
    if (hasAll) return true;
  }
  if (["booking:update", "booking:cancel"].includes(requiredPermission)) {
    if (hasPermission(session.role, requiredPermission) && hasAll) return true;
  }

  const isOwner =
    booking.surgeonId === session.userId ||
    booking.createdByUserId === session.userId;

  if (requiredPermission === "booking:view:own" && hasPermission(session.role, "booking:view:own")) {
    return isOwner;
  }
  if (requiredPermission === "booking:update" && hasPermission(session.role, "booking:update")) {
    return isOwner || hasAll;
  }
  if (requiredPermission === "booking:cancel" && hasPermission(session.role, "booking:cancel")) {
    return isOwner || hasAll;
  }

  return false;
}

/**
 * ¿Puede el usuario modificar (actualizar o cancelar) un paciente de esta reserva?
 * Requiere patient:update o patient:cancel según la acción.
 * ANESTESISTA no tiene estos permisos.
 */
export function canModifyPatientInBooking(
  session: AuthSession | null,
  booking: BookingLike,
  action: "patient:update" | "patient:cancel"
): boolean {
  if (!session?.userId) return false;
  if (!hasPermission(session.role, action)) return false;
  return canAccessBooking(session, booking, "booking:view:own");
}

/**
 * ¿Puede el usuario acceder a esta programación (slot/turno)?
 * - schedule:view:all → sí
 * - schedule:view:own + anesthetistId = userId → sí (anestesista ve sus turnos)
 */
export function canAccessSchedule(
  session: AuthSession | null,
  schedule: ScheduleLike,
  _requiredPermission: "schedule:view:all" | "schedule:view:own" = "schedule:view:own"
): boolean {
  if (!session?.userId) return false;

  if (hasPermission(session.role, "schedule:view:all")) return true;
  if (hasPermission(session.role, "schedule:view:own") && schedule.anesthetistId === session.userId) {
    return true;
  }
  return false;
}

/**
 * ¿Puede el usuario acceder a este paciente?
 * Los pacientes están dentro de reservas. El acceso se verifica vía la reserva.
 * Se requiere pasar la reserva (o sus campos) para evaluar ownership.
 */
export function canAccessPatient(
  session: AuthSession | null,
  patient: PatientLike,
  booking: BookingLike
): boolean {
  return canAccessBooking(session, booking, "booking:view:own");
}
