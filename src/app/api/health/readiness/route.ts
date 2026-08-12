import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { isDependencyReady } from "@/lib/health/readiness";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

/**
 * Deployment/readiness probe.
 * Checks only that the application can reach PostgreSQL and deliberately
 * returns no database, host, schema, credential, or error details.
 */
export async function GET() {
  const databaseReady = await isDependencyReady(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  if (!databaseReady) {
    console.error("[Readiness] Database dependency unavailable");
    return NextResponse.json(
      { status: "unavailable" },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json(
    { status: "ok" },
    { status: 200, headers: NO_STORE_HEADERS },
  );
}
