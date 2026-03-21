/**
 * Validación de seguridad del webhook de correo entrante.
 * Usa token secreto en header o query.
 *
 * .env:
 *   EMAIL_WEBHOOK_SECRET=tu_token_secreto_minimo_16_caracteres
 *
 * Para pruebas locales, añadir a .env:
 *   EMAIL_WEBHOOK_SECRET=local-dev-secret-16chars
 *
 * Header: x-email-webhook-secret: <valor>
 * Query: ?webhookSecret=<valor>
 */

const HEADER_NAME = "x-email-webhook-secret";
const QUERY_PARAM = "webhookSecret";

/** En desarrollo sin secret configurado, permite bypass con valor fijo para pruebas */
const DEV_BYPASS = "dev-local-testing-bypass";

export function validateWebhookSecret(request: Request): boolean {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  const isDev = process.env.NODE_ENV === "development";

  const header = request.headers.get(HEADER_NAME);
  let queryVal: string | null = null;
  try {
    queryVal = new URL(request.url).searchParams.get(QUERY_PARAM);
  } catch {
    /* ignore */
  }

  if (secret && secret.length >= 16) {
    if (header === secret || queryVal === secret) return true;
  }

  if (isDev && (!secret || secret.length < 16)) {
    if (header === DEV_BYPASS || queryVal === DEV_BYPASS) return true;
  }

  return false;
}

export function isWebhookDisabled(): boolean {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  return !secret || secret.length < 16;
}
