import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  ReservationsApiError,
  createReservation,
  fetchReservations,
  type CreateReservationPayload,
} from "../src/lib/api/reservations";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const apiReservation = {
  id: "reservation-1",
  date: "2031-04-10",
  resourceId: "Q1",
  shift: "morning",
  slotIndex: 0,
  surgeonId: "surgeon-1",
  status: "confirmed",
  createdAt: "2031-01-01T00:00:00.000Z",
  patients: [],
};

test("fetchReservations uses the shared /api client and maps response", async () => {
  let requestedUrl = "";
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ reservations: [apiReservation] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const result = await fetchReservations({ dateFrom: "2031-04-01", dateTo: "2031-04-30", resourceId: "Q1" });

  assert.equal(requestedUrl, "/api/reservations?dateFrom=2031-04-01&dateTo=2031-04-30&resourceId=Q1");
  assert.equal(result.length, 1);
  assert.equal(result[0]?.id, "reservation-1");
  assert.equal(result[0]?.shift, "morning");
});

test("createReservation preserves server conflict code and message", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({
    error: "El tramo solicitado se solapa con otra reserva",
    code: "SLOT_CONFLICT",
  }), {
    status: 409,
    headers: { "content-type": "application/json" },
  })) as typeof fetch;

  const payload: CreateReservationPayload = {
    date: "2031-04-10",
    resourceId: "Q1",
    shift: "morning",
    slotIndex: 0,
    patients: [],
  };

  await assert.rejects(
    () => createReservation(payload),
    (error: unknown) => {
      assert.ok(error instanceof ReservationsApiError);
      assert.equal(error.status, 409);
      assert.equal(error.code, "SLOT_CONFLICT");
      assert.equal(error.message, "El tramo solicitado se solapa con otra reserva");
      return true;
    },
  );
});

test("fetchReservations keeps the established friendly session-expired error", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: "No autorizado" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  })) as typeof fetch;

  await assert.rejects(
    () => fetchReservations(),
    (error: unknown) => {
      assert.ok(error instanceof ReservationsApiError);
      assert.equal(error.status, 401);
      assert.equal(error.message, "Sesión expirada. Inicie sesión de nuevo.");
      return true;
    },
  );
});
