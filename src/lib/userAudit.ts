/**
 * Auditoría de acciones sobre usuarios.
 *
 * NOTA: UserAuditEvent no existe en schema desplegado. No-op silencioso.
 */

export type UserAuditEventType = "USER_DEACTIVATED" | "USER_REACTIVATED" | "USER_DELETED" | "USER_INVITATION_RESENT";

export async function logUserAuditEvent(_params: {
  userId: string;
  eventType: UserAuditEventType;
  actorUserId?: string | null;
  detailsJson?: Record<string, unknown> | null;
}): Promise<void> {
  // UserAuditEvent no existe en schema desplegado
}
