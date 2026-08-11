/** Auditoría persistente de acciones administrativas sobre usuarios. */

import { prisma } from "@/lib/db/prisma";

export type UserAuditEventType =
  | "USER_DEACTIVATED"
  | "USER_REACTIVATED"
  | "USER_DELETED"
  | "USER_INVITATION_RESENT"
  | "USER_PASSWORD_REGENERATED";

export async function logUserAuditEvent(params: {
  userId: string;
  eventType: UserAuditEventType;
  actorUserId?: string | null;
  detailsJson?: Record<string, unknown> | null;
}): Promise<void> {
  await prisma.userAuditEvent.create({
    data: {
      userId: params.userId,
      eventType: params.eventType,
      actorUserId: params.actorUserId ?? null,
      detailsJson: params.detailsJson ? JSON.stringify(params.detailsJson) : null,
    },
  });
}
