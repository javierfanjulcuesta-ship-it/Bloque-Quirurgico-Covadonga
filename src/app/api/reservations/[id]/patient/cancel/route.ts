/**
 * PATCH /api/reservations/[id]/patient/cancel
 * Desactivado temporalmente: módulo de reservations no disponible.
 */

export async function PATCH() {
  return Response.json(
    { error: "Reservas no disponibles temporalmente" },
    { status: 503 }
  );
}
