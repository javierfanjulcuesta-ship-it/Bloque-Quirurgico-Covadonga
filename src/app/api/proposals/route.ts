import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { stripSensitiveKeys } from "@/lib/agent/minimize";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = toAuthSession(await getSessionFromCookie());
  const denyAuth = requireAuth(session);
  if (denyAuth) return denyAuth;
  const deny = requirePermission(session!, "booking:view:all");
  if (deny) return deny;

  const rows = await prisma.proposal.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({
    proposals: rows.map((row) => ({
      id: row.id,
      weekStart: row.weekStart,
      type: row.type,
      status: row.status,
      summary: row.summary,
      payload: stripSensitiveKeys(JSON.parse(row.payloadJson) as unknown),
      decisionReason: row.decisionReason,
      createdAt: row.createdAt.toISOString(),
    })),
  });
}
