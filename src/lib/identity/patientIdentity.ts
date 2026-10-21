import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { stripSensitiveKeys } from "@/lib/agent/minimize";

export const IDENTITY_KEY_VERSION = "v1";
export const DEFAULT_IDENTITY_RETENTION_DAYS = 365;
const REDACTED_SUBJECT = "Correo recibido";
const REDACTED_CONTACT_SUBJECT = "Solicitud de acceso";
const REDACTED_BODY = "[redactado]";
const READ_ROLES = new Set(["gestor", "gestor-anestesista", "GESTOR", "GESTOR_ANESTESISTA"]);

export interface IdentityConfig {
  requested: boolean;
  armed: boolean;
  encryptionKey: string;
  legalBasis: string;
  retentionDays: number;
}

export interface IdentityVaultField {
  fieldName: string;
  ciphertext: string;
  keyVersion: string;
  retentionUntil: Date;
}

export function readIdentityConfig(env: Record<string, string | undefined> = process.env): IdentityConfig {
  const retention = Number(env.PATIENT_IDENTITY_RETENTION_DAYS ?? DEFAULT_IDENTITY_RETENTION_DAYS);
  return {
    requested: env.STORE_PATIENT_IDENTITY === "true",
    armed: env.PATIENT_IDENTITY_ARMED === "true",
    encryptionKey: env.PATIENT_IDENTITY_ENCRYPTION_KEY?.trim() ?? "",
    legalBasis: env.PATIENT_IDENTITY_LEGAL_BASIS?.trim() ?? "",
    retentionDays: Number.isFinite(retention) && retention > 0 ? Math.floor(retention) : DEFAULT_IDENTITY_RETENTION_DAYS,
  };
}

/** Apagado por defecto. Hace falta el flag, el armado, una clave larga y una base legal escrita. */
export function isPatientIdentityStorageActive(config = readIdentityConfig()): boolean {
  return config.requested && config.armed && config.encryptionKey.length >= 32 && config.legalBasis.length >= 12;
}

export function canReadPatientIdentity(role: string, config = readIdentityConfig()): boolean {
  return isPatientIdentityStorageActive(config) && READ_ROLES.has(role);
}

export function retentionUntil(from: Date, retentionDays: number): Date {
  return new Date(from.getTime() + retentionDays * 24 * 60 * 60 * 1000);
}

function encryptionKey(material: string): Buffer {
  return createHash("sha256").update(material).digest();
}

export function encryptField(plaintext: string, keyMaterial: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(keyMaterial), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${IDENTITY_KEY_VERSION}:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptField(payload: string, keyMaterial: string): string {
  const [version, ivText, tagText, dataText] = payload.split(":");
  if (version !== IDENTITY_KEY_VERSION || !ivText || !tagText || !dataText) {
    throw new Error("Cifrado de identidad no reconocido");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(keyMaterial), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataText, "base64url")), decipher.final()]).toString("utf8");
}

function vaultFields(
  fields: Record<string, string | null | undefined>,
  config: IdentityConfig,
  now: Date,
): IdentityVaultField[] {
  if (!isPatientIdentityStorageActive(config)) return [];
  const until = retentionUntil(now, config.retentionDays);
  return Object.entries(fields).flatMap(([fieldName, value]) => {
    const text = value?.trim();
    if (!text) return [];
    return [{
      fieldName,
      ciphertext: encryptField(text, config.encryptionKey),
      keyVersion: IDENTITY_KEY_VERSION,
      retentionUntil: until,
    }];
  });
}

export function planIncomingEmailStorage(
  input: { fromName?: string | null; subject?: string | null; bodyPlain?: string | null; bodyHtml?: string | null },
  config = readIdentityConfig(),
  now = new Date(),
) {
  const active = isPatientIdentityStorageActive(config);
  return {
    row: {
      fromName: null as string | null,
      subject: REDACTED_SUBJECT,
      bodyPlain: null as string | null,
      bodyHtml: null as string | null,
      bodySummary: null as string | null,
      identityMode: active ? "ciphertext" as const : "redacted" as const,
      bodyRedactedAt: active ? null : now,
    },
    vault: vaultFields(
      {
        fromName: input.fromName,
        subject: input.subject,
        bodyPlain: input.bodyPlain,
        bodyHtml: input.bodyHtml,
      },
      config,
      now,
    ),
  };
}

export function planContactStorage(
  input: { fromName: string; fromEmail: string; subject?: string | null; body: string },
  config = readIdentityConfig(),
  now = new Date(),
) {
  const active = isPatientIdentityStorageActive(config);
  return {
    row: {
      fromName: "Solicitante",
      fromEmail: input.fromEmail,
      subject: REDACTED_CONTACT_SUBJECT,
      body: REDACTED_BODY,
      identityMode: active ? "ciphertext" as const : "redacted" as const,
      bodyRedactedAt: active ? null : now,
    },
    vault: vaultFields(
      { fromName: input.fromName, subject: input.subject, body: input.body },
      config,
      now,
    ),
  };
}

/**
 * La pantalla de acceso enseña siempre la ficha operativa.
 * El texto real, si algún día se guarda, vive cifrado y no sale por esta función.
 */
export function presentContactMessage<T extends { fromName: string; subject: string | null; body: string }>(
  message: T,
): T {
  return { ...message, fromName: "Solicitante", subject: REDACTED_CONTACT_SUBJECT, body: REDACTED_BODY };
}

/** Lectura futura. Hoy ninguna ruta la llama. Sin rol y sin cifrado activo devuelve null. */
export function readIdentityField(ciphertext: string, role: string, config = readIdentityConfig()): string | null {
  if (!canReadPatientIdentity(role, config)) return null;
  return decryptField(ciphertext, config.encryptionKey);
}

export function sanitizeEventDetails(details: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!details) return null;
  return stripSensitiveKeys(details) as Record<string, unknown>;
}

export function redactEventDetailsJson(detailsJson: string | null): string | null {
  if (!detailsJson) return detailsJson;
  try {
    const parsed = JSON.parse(detailsJson) as unknown;
    return JSON.stringify(stripSensitiveKeys(parsed));
  } catch {
    return REDACTED_BODY;
  }
}

export function redactLogDetails(details: string | null): string | null {
  return redactEventDetailsJson(details);
}

/** Conserva avisos operativos cortos. Sustituye un texto que parece llevar historia o un identificador. */
export function redactOperationalError(message: string | null): string | null {
  if (!message) return message;
  if (message.length <= 180 && !/historia|history|paciente\s+\d+|hc-|dni|nie|nif|@/i.test(message)) {
    return message;
  }
  return "Mensaje operativo redactado";
}

export const IDENTITY_AUDIT_ACTIONS = ["store", "read"] as const;
