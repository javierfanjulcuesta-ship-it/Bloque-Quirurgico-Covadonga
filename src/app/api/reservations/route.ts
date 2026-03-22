/**
 * API de reservas.
 * Desactivado temporalmente: módulo de reservations no disponible.
 */

export async function POST() {
  return Response.json(
    { error: "Reservas no disponibles temporalmente" },
    { status: 503 }
  );
}

export async function GET() {
  return Response.json(
    { error: "Reservas no disponibles temporalmente" },
    { status: 503 }
  );
}
