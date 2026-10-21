import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = toAuthSession(await getSessionFromCookie());
  const denyAuth = requireAuth(session);
  if (denyAuth) return denyAuth;
  const deny = requirePermission(session!, "booking:view:all");
  if (deny) return deny;
  const { id } = await params;
  const draft = await prisma.outboundDraft.findUnique({ where: { id }, select: { status: true } });
  if (!draft || draft.status !== "PENDING_APPROVAL") {
    return NextResponse.json({ error: "El borrador no está pendiente" }, { status: 409 });
  }
  await prisma.outboundDraft.update({ where: { id }, data: { status: "REJECTED" } });
  return NextResponse.json({ id, status: "REJECTED" });
}
