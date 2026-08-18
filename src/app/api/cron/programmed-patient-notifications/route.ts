/**
 * POST /api/cron/programmed-patient-notifications
 * Processes a bounded batch from the durable programmed-patient notification outbox.
 * Requires Authorization: Bearer <CRON_SECRET>.
 *
 * isolated-demo remains blocked globally by proxy.ts; the explicit guard below is
 * defence in depth so this handler never reaches Prisma if invoked directly there.
 */

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { sendEmail } from "@/lib/email/outlookService";
import { runProgrammedPatientNotificationWorker } from "@/lib/email/programmedPatientNotificationWorker";
import { bearerToken, secretsEqual } from "@/lib/security/secrets";

export async function POST() {
  if (process.env.NEXT_PUBLIC_DEPLOYMENT_MODE === "isolated-demo") {
    return NextResponse.json({ error: "No disponible" }, { status: 404 });
  }

  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || secret.length < 24) {
      return NextResponse.json({ error: "CRON_SECRET no configurado o demasiado corto" }, { status: 503 });
    }

    const token = bearerToken((await headers()).get("authorization"));
    if (!secretsEqual(token, secret)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const result = await runProgrammedPatientNotificationWorker({
      prisma,
      deliver: sendEmail,
      maxMessages: 10,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error(
      "[cron programmed-patient-notifications]",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
