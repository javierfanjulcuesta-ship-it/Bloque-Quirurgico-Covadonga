/**
 * Purga manual del texto identificativo ya guardado.
 * No forma parte de las migraciones, ni de CI, ni de ningún script de npm.
 *
 *   CONFIRM_PURGE_IDENTIFYING_TEXT=purga-manual npx tsx scripts/privacy/purge-identifying-text.ts
 *
 * Se niega si falta esa confirmación o si DATABASE_URL no es una base de prueba.
 */

import { pathToFileURL } from "node:url";
import type { PrismaClient } from "@prisma/client";
import { assertPreviewDatabase } from "../db/databaseTarget.mjs";
import {
  redactEventDetailsJson,
  redactLogDetails,
  redactOperationalError,
} from "../../src/lib/identity/patientIdentity";

export const PURGE_CONFIRM = "purga-manual";

export function purgeAllowed(env: Record<string, string | undefined> = process.env) {
  try {
    assertPreviewDatabase(env.DATABASE_URL, env.PRODUCTION_DATABASE_URL);
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Base no admitida" };
  }
  if (env.CONFIRM_PURGE_IDENTIFYING_TEXT !== PURGE_CONFIRM) {
    return {
      ok: false as const,
      error: `Defina CONFIRM_PURGE_IDENTIFYING_TEXT=${PURGE_CONFIRM} para purgar texto identificativo. No es automático.`,
    };
  }
  return { ok: true as const };
}

export async function applyPurge(db: PrismaClient) {
  const now = new Date();
  const emails = await db.emailMessage.updateMany({
    data: {
      fromName: null,
      subject: "Correo recibido",
      bodyPlain: null,
      bodyHtml: null,
      bodySummary: null,
      identityMode: "redacted",
      bodyRedactedAt: now,
    },
  });

  const emailRows = await db.emailMessage.findMany({ select: { id: true, resultMessage: true } });
  let emailNotes = 0;
  for (const row of emailRows) {
    const resultMessage = redactOperationalError(row.resultMessage);
    if (resultMessage !== row.resultMessage) {
      await db.emailMessage.update({ where: { id: row.id }, data: { resultMessage } });
      emailNotes += 1;
    }
  }

  const contacts = await db.contactMessage.updateMany({
    data: {
      fromName: "Solicitante",
      subject: "Solicitud de acceso",
      body: "[redactado]",
      identityMode: "redacted",
      bodyRedactedAt: now,
    },
  });

  const events = await db.reservationEvent.findMany({ select: { id: true, detailsJson: true } });
  let eventsChanged = 0;
  for (const event of events) {
    const detailsJson = redactEventDetailsJson(event.detailsJson);
    if (detailsJson !== event.detailsJson) {
      await db.reservationEvent.update({ where: { id: event.id }, data: { detailsJson } });
      eventsChanged += 1;
    }
  }

  const logs = await db.emailProcessingLog.findMany({
    select: { id: true, details: true, errorMessage: true },
  });
  let logsChanged = 0;
  for (const log of logs) {
    const details = redactLogDetails(log.details);
    const errorMessage = redactOperationalError(log.errorMessage);
    if (details !== log.details || errorMessage !== log.errorMessage) {
      await db.emailProcessingLog.update({ where: { id: log.id }, data: { details, errorMessage } });
      logsChanged += 1;
    }
  }

  return {
    emails: emails.count,
    emailNotes,
    contacts: contacts.count,
    eventsChanged,
    logsChanged,
  };
}

async function main() {
  const decision = purgeAllowed();
  if (!decision.ok) {
    console.error(decision.error);
    process.exit(1);
  }
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const counts = await applyPurge(prisma);
    console.log(JSON.stringify(counts));
  } finally {
    await prisma.$disconnect();
  }
}

const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "La purga no se completó");
    process.exit(1);
  });
}
