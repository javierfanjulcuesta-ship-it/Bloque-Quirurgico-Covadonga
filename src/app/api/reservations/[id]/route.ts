/**
 * GET /api/reservations/[id] - Detalle de una reserva.
 * PATCH /api/reservations/[id] - Añadir pacientes a reserva existente.
 * Desactivado temporalmente: módulo de reservations no disponible.
 */

export async function GET() {
  return Response.json(
    { error: "Reservas no disponibles temporalmente" },
    { status: 503 }
  );
}

export async function PATCH() {
  return Response.json(
    { error: "Reservas no disponibles temporalmente" },
    { status: 503 }
  );
}
