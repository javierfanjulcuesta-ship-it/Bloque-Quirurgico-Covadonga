export const CONTACT_REQUEST_MAX_BYTES = 16_384;

export type ParsedContactInput = {
  fromName: string;
  fromEmail: string;
  subject: string | null;
  body: string;
};

export type ContactInputResult =
  | { ok: true; data: ParsedContactInput }
  | { ok: false; status: 400 | 413; error: string };

const MAX_NAME_LENGTH = 200;
const MAX_EMAIL_LENGTH = 254;
const MAX_SUBJECT_LENGTH = 300;
const MAX_BODY_LENGTH = 5000;

export function parseContactInput(rawText: string): ContactInputResult {
  if (Buffer.byteLength(rawText, "utf8") > CONTACT_REQUEST_MAX_BYTES) {
    return { ok: false, status: 413, error: "Solicitud demasiado grande" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, status: 400, error: "JSON inválido" };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, status: 400, error: "Datos inválidos" };
  }

  const body = parsed as Record<string, unknown>;
  const fromName = typeof body.fromName === "string" ? body.fromName.trim() : "";
  const fromEmail = typeof body.fromEmail === "string" ? body.fromEmail.trim().toLowerCase() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const bodyText = typeof body.body === "string" ? body.body.trim() : "";

  if (!fromName || !fromEmail) {
    return { ok: false, status: 400, error: "Nombre y correo son obligatorios" };
  }
  if (fromName.length > MAX_NAME_LENGTH || fromEmail.length > MAX_EMAIL_LENGTH) {
    return { ok: false, status: 400, error: "Nombre o correo demasiado largo" };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
    return { ok: false, status: 400, error: "Correo no válido" };
  }
  if (!bodyText) {
    return { ok: false, status: 400, error: "El mensaje no puede estar vacío" };
  }
  if (bodyText.length > MAX_BODY_LENGTH || subject.length > MAX_SUBJECT_LENGTH) {
    return { ok: false, status: 400, error: "El contenido supera la longitud permitida" };
  }

  return {
    ok: true,
    data: {
      fromName,
      fromEmail,
      subject: subject || null,
      body: bodyText,
    },
  };
}
