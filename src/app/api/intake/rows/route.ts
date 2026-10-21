import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = toAuthSession(await getSessionFromCookie());
  const denyAuth = requireAuth(session);
  if (denyAuth) return denyAuth;
  const deny = requirePermission(session!, "booking:view:all");
  if (deny) return deny;

  const rows = await prisma.intakeRow.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      historyNumber: true,
      patientName: true,
      procedure: true,
      serviceDate: true,
      shift: true,
      resourceId: true,
      slotIndex: true,
      surgeonName: true,
      minutes: true,
      status: true,
      flags: true,
      suggestedShift: true,
      suggestedResourceId: true,
      reservationId: true,
      batch: { select: { status: true, fileName: true } },
    },
  });
  return NextResponse.json({
    rows: rows.map((row) => ({
      ...row,
      batchStatus: row.batch.status,
      fileName: row.batch.fileName,
      batch: undefined,
    })),
  });
}
