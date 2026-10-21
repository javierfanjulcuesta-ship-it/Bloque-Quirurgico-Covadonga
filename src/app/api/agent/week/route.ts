import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { hasAgentServiceToken } from "@/lib/agent/serviceAuth";
import { minimizeReservation } from "@/lib/agent/minimize";
import { isRealDateOnly } from "@/lib/reservations/bookingPolicy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!hasAgentServiceToken(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!isRealDateOnly(from) || !isRealDateOnly(to)) {
    return NextResponse.json({ error: "from y to deben ser YYYY-MM-DD" }, { status: 400 });
  }
  const diff = (new Date(`${to}T00:00:00.000Z`).getTime() - new Date(`${from}T00:00:00.000Z`).getTime()) / 86_400_000;
  if (diff < 0 || diff > 14) return NextResponse.json({ error: "Rango máximo 14 días" }, { status: 400 });

  const rows = await prisma.reservation.findMany({
    where: {
      status: { in: ["PENDING", "CONFIRMED"] },
      date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) },
    },
    select: {
      id: true,
      date: true,
      resourceId: true,
      shift: true,
      slotIndex: true,
      surgeon: { select: { name: true } },
      patients: {
        select: {
          historyNumber: true,
          fullName: true,
          procedure: true,
          estimatedDurationMinutes: true,
          workflowStatus: true,
        },
      },
    },
    orderBy: [{ date: "asc" }, { resourceId: "asc" }, { slotIndex: "asc" }],
  });

  return NextResponse.json({
    from,
    to,
    reservations: rows.map((row) => minimizeReservation({
      id: row.id,
      date: row.date.toISOString().slice(0, 10),
      resourceId: row.resourceId,
      shift: row.shift,
      slotIndex: row.slotIndex,
      surgeonName: row.surgeon.name,
      patients: row.patients,
    })),
  });
}
