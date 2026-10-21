export const OUTBOUND_DRAFT_TTL_DAYS = 7;

export function outboundDraftExpiresAt(from = new Date()): Date {
  return new Date(from.getTime() + OUTBOUND_DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function isOutboundDraftExpired(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}
