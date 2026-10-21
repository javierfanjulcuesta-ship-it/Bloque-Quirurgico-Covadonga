import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { hasAgentServiceToken } from "@/lib/agent/serviceAuth";
import { isProposalType, stripSensitiveKeys } from "@/lib/agent/minimize";
import { readTextBodyWithLimit } from "@/lib/http/requestBody";
import { isRealDateOnly } from "@/lib/reservations/bookingPolicy";

export const dynamic = "force-dynamic";

const MAX_BODY = 64 * 1024;

export async function POST(request: Request) {
  if (!hasAgentServiceToken(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const limited = await readTextBodyWithLimit(request, MAX_BODY);
  if (!limited.ok) return NextResponse.json({ error: "Cuerpo demasiado grande" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(limited.text);
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }
  const raw = body as { weekStart?: unknown; type?: unknown; summary?: unknown; payload?: unknown };
  if (!isRealDateOnly(typeof raw.weekStart === "string" ? raw.weekStart : "") || !isProposalType(raw.type)) {
    return NextResponse.json({ error: "Semana o tipo de propuesta no válidos" }, { status: 400 });
  }
  const summary = typeof raw.summary === "string" ? raw.summary.trim().slice(0, 240) : "";
  if (!summary || !raw.payload || typeof raw.payload !== "object") {
    return NextResponse.json({ error: "Faltan el resumen o el payload" }, { status: 400 });
  }
  const payload = stripSensitiveKeys(raw.payload);
  const created = await prisma.proposal.create({
    data: {
      weekStart: raw.weekStart as string,
      type: raw.type,
      status: "PENDING",
      summary,
      payloadJson: JSON.stringify(payload),
    },
    select: { id: true, status: true },
  });
  return NextResponse.json({ id: created.id, status: created.status }, { status: 201 });
}
