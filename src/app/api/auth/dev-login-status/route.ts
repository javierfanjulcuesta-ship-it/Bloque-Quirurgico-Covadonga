import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function devUtilitiesEnabled() {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.VERCEL_ENV === "production") return false;
  return process.env.ALLOW_DEV_UTILITIES === "1";
}

export async function GET() {
  if (!devUtilitiesEnabled()) {
    return NextResponse.json({ error: "No permitido." }, { status: 404 });
  }

  try {
    const usersCount = await prisma.user.count();
    return NextResponse.json({
      noUsers: usersCount === 0,
      usersCount,
    });
  } catch (err) {
    console.error("[auth/dev-login-status]", err);
    return NextResponse.json({ error: "No se pudo comprobar usuarios." }, { status: 500 });
  }
}

