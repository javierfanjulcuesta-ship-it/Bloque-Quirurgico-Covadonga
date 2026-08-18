import type { AppNotification } from "@/lib/types";

export interface ResponsibleSurgeonNotice {
  responsibleUserId: string;
  title: string;
  message: string;
}

export type AddAppNotification = (
  notification: Omit<AppNotification, "id" | "date" | "read">
) => void;

/**
 * Mirrors an already-approved surgeon-targeted operational notice into QxFlow.
 * The caller must resolve the responsible surgeon before invoking this helper.
 * No fan-out is performed here: exactly one userId receives the notification.
 */
export function addResponsibleSurgeonInAppNotification(
  notice: ResponsibleSurgeonNotice,
  addNotification: AddAppNotification
): boolean {
  const responsibleUserId = notice.responsibleUserId.trim();
  const title = notice.title.trim();
  const message = notice.message.trim();

  if (!responsibleUserId || !title || !message) return false;

  addNotification({
    userId: responsibleUserId,
    title,
    message,
  });
  return true;
}
