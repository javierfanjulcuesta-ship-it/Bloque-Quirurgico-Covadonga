/**
 * Ruta legacy duplicada: /api/reservations/reservations/[id]/cancel
 * Algunos entornos o proxies podían acabar aquí y recibían 503.
 * Reexpone el mismo PATCH que /api/reservations/[id]/cancel.
 */

import { executeReservationCancelPatch } from "@/lib/reservations/executeReservationCancelPatch";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return executeReservationCancelPatch(request, id);
}
