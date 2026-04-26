/**
 * PATCH /api/reservations/[id]/cancel
 * Cancela una reserva completa. Si tiene pacientes, exige confirmación explícita (`force: true`).
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
