import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { readTextBodyWithLimit } from "@/lib/http/requestBody";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = toAuthSession(await getSessionFromCookie());
  const denyAuth = requireAuth(session);
  if (denyAuth) return denyAuth;
  const deny = requirePermission(session!, "rules:edit");
  if (deny) return deny;
  const row = await prisma.serviceRecipient.findUnique({
    where: { key: "endoscopias" },
    select: { userId: true },
  });
  const endoscopists = await prisma.user.findMany({
    where: { deletedAt: null, approved: true, role: UserRole.ENDOSCOPISTA },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ endoscopyUserId: row?.userId ?? null, endoscopists });
}

export async function PUT(request: Request) {
  const session = toAuthSession(await getSessionFromCookie());
  const denyAuth = requireAuth(session);
  if (denyAuth) return denyAuth;
  const deny = requirePermission(session!, "rules:edit");
  if (deny) return deny;
  const limited = await readTextBodyWithLimit(request, 4 * 1024);
  if (!limited.ok) return NextResponse.json({ error: "Cuerpo demasiado grande" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(limited.text);
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }
  const userId = typeof (body as { userId?: unknown }).userId === "string" ? (body as { userId: string }).userId.trim() : "";
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, approved: true, role: UserRole.ENDOSCOPISTA },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: "Endoscopista no encontrado" }, { status: 404 });
  await prisma.serviceRecipient.upsert({
    where: { key: "endoscopias" },
    create: { key: "endoscopias", userId },
    update: { userId },
  });
  return NextResponse.json({ ok: true, endoscopyUserId: userId });
}
