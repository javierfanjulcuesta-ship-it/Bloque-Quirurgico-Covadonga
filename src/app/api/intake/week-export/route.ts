import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { isRealDateOnly } from "@/lib/reservations/bookingPolicy";
import { buildWeekWorkbook } from "@/lib/intake/weekWorkbook";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = toAuthSession(await getSessionFromCookie());
  const denyAuth = requireAuth(session);
  if (denyAuth) return denyAuth;
  const deny = requirePermission(session!, "booking:view:all");
  if (deny) return deny;

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!isRealDateOnly(from) || !isRealDateOnly(to)) {
    return NextResponse.json({ error: "from y to deben ser YYYY-MM-DD" }, { status: 400 });
  }
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);
  const diff = (toDate.getTime() - fromDate.getTime()) / 86_400_000;
  if (diff < 0 || diff > 14) return NextResponse.json({ error: "Rango máximo 14 días" }, { status: 400 });

  const [reservations, changes] = await Promise.all([
    prisma.reservation.findMany({
      where: { status: { in: ["PENDING", "CONFIRMED"] }, date: { gte: fromDate, lte: toDate } },
      select: {
        date: true,
        shift: true,
        slotIndex: true,
        resourceId: true,
        surgeon: { select: { name: true } },
        patients: {
          where: { workflowStatus: { not: "SUSPENDED" } },
          select: { historyNumber: true, fullName: true, procedure: true, estimatedDurationMinutes: true },
        },
      },
      orderBy: [{ date: "asc" }, { resourceId: "asc" }, { slotIndex: "asc" }],
    }),
    prisma.scheduleChange.findMany({
      where: { createdAt: { gte: fromDate, lt: new Date(toDate.getTime() + 86_400_000) } },
      select: { createdAt: true, changeType: true, reasonCode: true, beforeJson: true, afterJson: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const program = reservations.flatMap((reservation) => reservation.patients.map((patient) => ({
    date: reservation.date.toISOString().slice(0, 10),
    shift: reservation.shift === "AFTERNOON" ? "afternoon" as const : "morning" as const,
    slotIndex: reservation.slotIndex,
    resourceId: reservation.resourceId,
    surgeonName: reservation.surgeon.name,
    historyNumber: patient.historyNumber,
    patientName: patient.fullName,
    procedure: patient.procedure,
    minutes: patient.estimatedDurationMinutes,
  })));
  const bytes = buildWeekWorkbook({
    program,
    changes: changes.map((change) => ({
      createdAt: change.createdAt.toISOString(),
      changeType: change.changeType,
      reasonCode: change.reasonCode,
      beforeJson: change.beforeJson,
      afterJson: change.afterJson,
    })),
  });
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="semana-${from}.xlsx"`,
    },
  });
}
