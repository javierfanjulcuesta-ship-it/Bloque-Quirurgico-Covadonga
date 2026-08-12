/**
 * Planes de apertura del bloque.
 * GET - Listar planes (schedule:view:own | schedule:view:all). Rango max 93 días.
 * PUT - Crear/actualizar plan (or:open_close, solo gestores).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission, requireAnyPermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { RESOURCES } from "@/lib/constants";
import { toBlockOpeningPlanView } from "@/lib/blockOpeningPlan";
import { withSchedulingContextLock } from "@/lib/reservations/bookingContextLock";

export const dynamic = "force-dynamic";

const RESOURCE_IDS = RESOURCES.map((r) => r.id) as [string, ...string[]];
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)");
const putSchema = z.object({
  date: dateSchema,
  resourceId: z.enum(RESOURCE_IDS),
  shift: z.enum(["morning", "afternoon"]),
  status: z.enum(["OPEN", "CLOSED", "URGENT_RESERVED"]),
  minRequiredMinutes: z.number().int().min(0).max(24 * 60).optional().default(0),
  reservedUrgentMinutes: z.number().int().min(0).max(24 * 60).optional().default(0),
  notes: z.string().max(4000).trim().nullable().optional(),
  // null = el cliente cargó esta celda sin plan persistido; ISO = versión que vio.
  expectedUpdatedAt: z.string().datetime({ offset: true }).nullable(),
});

class StaleBlockOpeningPlanError extends Error {
  constructor() {
    super("El plan de apertura ha cambiado desde que se cargó. Recargue la vista y revise la versión actual antes de volver a guardar.");
    this.name = "StaleBlockOpeningPlanError";
  }
}

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Ver planes de apertura (agenda). Requiere schedule:view:own o schedule:view:all. */
export async function GET(request: Request) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requireAnyPermission(session!, ["schedule:view:own", "schedule:view:all"]);
    if (denyPerm) return denyPerm;

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const resourceId = searchParams.get("resourceId");

    if (!dateFrom || !dateTo || !isValidDateOnly(dateFrom) || !isValidDateOnly(dateTo)) {
      return NextResponse.json({ error: "dateFrom y dateTo válidos (YYYY-MM-DD) son requeridos" }, { status: 400 });
    }
    if (resourceId && !RESOURCE_IDS.includes(resourceId)) {
      return NextResponse.json({ error: "resourceId inválido" }, { status: 400 });
    }

    const from = new Date(`${dateFrom}T00:00:00.000Z`);
    const to = new Date(`${dateTo}T23:59:59.999Z`);
    const maxDays = 93;
    const diffMs = to.getTime() - from.getTime();
    if (diffMs < 0 || diffMs > maxDays * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: `Rango máximo ${maxDays} días` }, { status: 400 });
    }

    const plans = await prisma.blockOpeningPlan.findMany({
      where: {
        date: { gte: from, lte: to },
        ...(resourceId ? { resourceId } : {}),
      },
      orderBy: [{ date: "asc" }, { resourceId: "asc" }, { shift: "asc" }],
    });

    return NextResponse.json({
      plans: plans.map((plan) => toBlockOpeningPlanView(plan as Parameters<typeof toBlockOpeningPlanView>[0])),
    });
  } catch (err) {
    console.error("[block-opening-plan GET]", err instanceof Error ? err.message : "Unknown error");
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requirePermission(session!, "or:open_close");
    if (denyPerm) return denyPerm;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }

    const parsed = putSchema.safeParse(body);
    if (!parsed.success || !isValidDateOnly(parsed.success ? parsed.data.date : "")) {
      return NextResponse.json(
        { error: parsed.success ? "Fecha inválida" : parsed.error.errors[0]?.message ?? "Datos inválidos" },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const dateObj = new Date(`${data.date}T00:00:00.000Z`);
    const shiftDb: "MORNING" | "AFTERNOON" = data.shift === "morning" ? "MORNING" : "AFTERNOON";

    const plan = await withSchedulingContextLock(
      { date: data.date, resourceId: data.resourceId, shift: data.shift },
      async (tx) => {
        const key = {
          date: dateObj,
          resourceId: data.resourceId,
          shift: shiftDb,
        };
        const current = await tx.blockOpeningPlan.findUnique({
          where: { date_resourceId_shift: key },
        });

        // Optimistic concurrency: a gestor solo puede modificar exactamente la versión
        // que cargó. El lock evita además carreras entre la comprobación y la escritura.
        if (current) {
          if (!data.expectedUpdatedAt || current.updatedAt.toISOString() !== data.expectedUpdatedAt) {
            throw new StaleBlockOpeningPlanError();
          }
          return tx.blockOpeningPlan.update({
            where: { id: current.id },
            data: {
              status: data.status,
              minRequiredMinutes: data.minRequiredMinutes,
              reservedUrgentMinutes: data.reservedUrgentMinutes,
              notes: data.notes ?? null,
              approvedByUserId: session!.userId,
            },
          });
        }

        // Si el cliente creía que existía un plan, este contexto ya no coincide con
        // lo que vio y no debemos convertir silenciosamente esa edición en un alta.
        if (data.expectedUpdatedAt !== null) {
          throw new StaleBlockOpeningPlanError();
        }

        return tx.blockOpeningPlan.create({
          data: {
            ...key,
            status: data.status,
            minRequiredMinutes: data.minRequiredMinutes,
            reservedUrgentMinutes: data.reservedUrgentMinutes,
            notes: data.notes ?? null,
            approvedByUserId: session!.userId,
          },
        });
      },
    );

    return NextResponse.json({
      plan: toBlockOpeningPlanView(plan as Parameters<typeof toBlockOpeningPlanView>[0]),
    });
  } catch (err) {
    if (err instanceof StaleBlockOpeningPlanError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("[block-opening-plan PUT]", err instanceof Error ? err.message : "Unknown error");
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
