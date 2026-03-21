/**
 * Módulo de autenticación y autorización.
 * Exporta permisos, helpers y tipos para uso en route handlers.
 */

export {
  type Permission,
  type Role,
  ROLE_PERMISSIONS,
  normalizeRole,
  hasPermission,
  hasAnyPermission,
} from "./permissions";

export {
  type AuthSession,
  toAuthSession,
  requireAuth,
  requireRole,
  requirePermission,
  requireAnyPermission,
  canAccessBooking,
  canModifyPatientInBooking,
  canAccessSchedule,
  canAccessPatient,
  type BookingLike,
  type ScheduleLike,
  type PatientLike,
  type DenyResult,
} from "./authorization";
