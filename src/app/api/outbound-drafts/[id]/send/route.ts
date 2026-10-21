/**
 * Único punto que envía un parte. Exige la pulsación del gestor sobre un borrador concreto.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { sendEmail } from "@/lib/email/outlookService";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = toAuthSession(await getSessionFromCookie());
  const denyAuth = requireAuth(session);
  if (denyAuth) return denyAuth;
  const deny = requirePermission(session!, "booking:view:all");
  if (deny) return deny;

  const { id } = await params;
  const draft = await prisma.outboundDraft.findUnique({
    where: { id },
    include: { recipients: true },
  });
  if (!draft || draft.status !== "PENDING_APPROVAL") {
    return NextResponse.json({ error: "El borrador no está pendiente de envío" }, { status: 409 });
  }
  if (draft.recipients.length === 0) {
    return NextResponse.json({ error: "El borrador no tiene destinatarios" }, { status: 409 });
  }

  try {
    for (const recipient of draft.recipients) {
      await sendEmail({ to: recipient.email, subject: draft.subject, textBody: draft.bodyText });
    }
  } catch {
    return NextResponse.json({ error: "No se pudo enviar el borrador. Sigue pendiente." }, { status: 502 });
  }

  await prisma.outboundDraft.update({
    where: { id },
    data: { status: "SENT", sentAt: new Date(), sentByUserId: session!.userId },
  });
  return NextResponse.json({ id, status: "SENT" });
}
