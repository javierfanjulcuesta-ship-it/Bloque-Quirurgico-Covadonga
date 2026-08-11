/**
 * Validación del webhook de correo entrante.
 * El secreto solo se acepta en header para evitar filtrarlo en URLs, logs,
 * historiales, proxies y herramientas de observabilidad.
 */

import { secretsEqual } from "@/lib/security/secrets";

const HEADER_NAME = "x-email-webhook-secret";
const MIN_SECRET_LENGTH = 24;

export function validateWebhookSecret(request: Request): boolean {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) return false;
  return secretsEqual(request.headers.get(HEADER_NAME), secret);
}

export function isWebhookDisabled(): boolean {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  return !secret || secret.length < MIN_SECRET_LENGTH;
}

export const EMAIL_WEBHOOK_SECRET_MIN_LENGTH = MIN_SECRET_LENGTH;
