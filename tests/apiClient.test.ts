import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { ApiError, ApiTimeoutError, apiFetch } from "../src/lib/api/client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("apiFetch parses successful JSON and preserves same-origin credentials", async () => {
  let captured: RequestInit | undefined;
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    captured = init;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const result = await apiFetch<{ ok: boolean }>("/health");
  assert.deepEqual(result, { ok: true });
  assert.equal(captured?.credentials, "same-origin");
  assert.equal(new Headers(captured?.headers).has("content-type"), false);
});

test("apiFetch exposes status, response body and Retry-After on HTTP errors", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: "Conflicto de revisión" }), {
    status: 409,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "retry-after": "7",
    },
  })) as typeof fetch;

  await assert.rejects(
    () => apiFetch("/reservations"),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.message, "Conflicto de revisión");
      assert.equal(error.status, 409);
      assert.equal(error.retryAfterSec, 7);
      assert.deepEqual(error.responseBody, { error: "Conflicto de revisión" });
      return true;
    },
  );
});

test("apiFetch accepts empty 204 responses without trying to parse JSON", async () => {
  globalThis.fetch = (async () => new Response(null, { status: 204 })) as typeof fetch;
  const result = await apiFetch<undefined>("/empty");
  assert.equal(result, undefined);
});

test("apiFetch times out stalled requests with a dedicated error", async () => {
  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      reject(new DOMException("aborted", "AbortError"));
    }, { once: true });
  })) as typeof fetch;

  await assert.rejects(
    () => apiFetch("/slow", { timeoutMs: 5 }),
    (error: unknown) => {
      assert.ok(error instanceof ApiTimeoutError);
      assert.equal(error.timeoutMs, 5);
      return true;
    },
  );
});

test("apiFetch propagates caller aborts instead of reporting them as timeouts", async () => {
  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      reject(new DOMException("aborted", "AbortError"));
    }, { once: true });
  })) as typeof fetch;

  const controller = new AbortController();
  const pending = apiFetch("/cancelled", { timeoutMs: 1_000, signal: controller.signal });
  controller.abort();

  await assert.rejects(
    () => pending,
    (error: unknown) => {
      assert.ok(error instanceof DOMException);
      assert.equal(error.name, "AbortError");
      return true;
    },
  );
});
