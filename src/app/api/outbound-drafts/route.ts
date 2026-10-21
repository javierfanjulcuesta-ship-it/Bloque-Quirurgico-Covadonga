import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { readTextBodyWithLimit } from "@/lib/http/requestBody";
import { createParteDraft } from "@/lib/drafts/createParteDraft";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = toAuthSession(await getSessionFromCookie());
  const denyAuth = requireAuth(session);
  if (denyAuth) return denyAuth;
  const deny = requirePermission(session!, "booking:view:all");
  if (deny) return deny;

  const drafts = await prisma.outboundDraft.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { recipients: { select: { displayName: true, email: true } } },
  });
  return NextResponse.json({
    drafts: drafts.map((draft) => ({
      id: draft.id,
      status: draft.status,
      subject: draft.subject,
      bodyText: draft.bodyText,
      warning: draft.warning,
      reservationId: draft.reservationId,
      createdAt: draft.createdAt.toISOString(),
      recipients: draft.recipients.map((recipient) => ({
        displayName: recipient.displayName,
        email: recipient.email,
      })),
    })),
  });
}

export async function POST(request: Request) {
  const session = toAuthSession(await getSessionFromCookie());
  const denyAuth = requireAuth(session);
  if (denyAuth) return denyAuth;
  const deny = requirePermission(session!, "booking:view:all");
  if (deny) return deny;
  const limited = await readTextBodyWithLimit(request, 8 * 1024);
  if (!limited.ok) return NextResponse.json({ error: "Cuerpo demasiado grande" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(limited.text);
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }
  const reservationId = typeof (body as { reservationId?: unknown }).reservationId === "string"
    ? (body as { reservationId: string }).reservationId.trim()
    : "";
  if (!reservationId) return NextResponse.json({ error: "Falta la reserva" }, { status: 400 });
  try {
    const draft = await createParteDraft(prisma, { reservationId, actorUserId: session!.userId });
    return NextResponse.json({ id: draft.id, status: "PENDING_APPROVAL", warning: draft.warning ?? null }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "No se pudo preparar el borrador" }, { status: 404 });
  }
}
