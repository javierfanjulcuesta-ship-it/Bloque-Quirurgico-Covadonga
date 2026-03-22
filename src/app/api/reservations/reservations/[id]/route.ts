import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ error: "service-unavailable" }, { status: 503 });
}

export async function PATCH() {
  return NextResponse.json({ error: "service-unavailable" }, { status: 503 });
}

export async function DELETE() {
  return NextResponse.json({ error: "service-unavailable" }, { status: 503 });
}
