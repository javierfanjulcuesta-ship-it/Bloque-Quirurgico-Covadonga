/**
 * Cliente API para modo real.
 * Todas las peticiones incluyen credentials para enviar cookies.
 *
 * Objetivos de resiliencia:
 * - timeout por defecto para no dejar la UI colgada indefinidamente;
 * - conservar status/Retry-After para que la UI pueda distinguir 401/409/429/5xx;
 * - no asumir que todas las respuestas son JSON;
 * - respetar AbortSignal del consumidor además del timeout interno.
 */

const BASE = "/api";
const DEFAULT_TIMEOUT_MS = 15_000;

export interface ApiFetchOptions extends RequestInit {
  timeoutMs?: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly retryAfterSec?: number;
  readonly responseBody?: unknown;

  constructor(
    message: string,
    options: { status: number; retryAfterSec?: number; responseBody?: unknown },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.retryAfterSec = options.retryAfterSec;
    this.responseBody = options.responseBody;
  }
}

export class ApiTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super("La conexión con el servidor ha tardado demasiado. Inténtelo de nuevo.");
    this.name = "ApiTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);

  const at = Date.parse(value);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

async function readResponseBody(res: Response): Promise<unknown> {
  if (res.status === 204 || res.status === 205) return undefined;

  const text = await res.text();
  if (!text) return undefined;

  const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json") || contentType.includes("+json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      // Una respuesta etiquetada como JSON pero corrupta sigue siendo útil como texto
      // para diagnóstico; no debe ocultar el status HTTP original.
      return text;
    }
  }

  return text;
}

function errorMessageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const error = (body as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) return error.trim();
  }
  if (typeof body === "string" && body.trim()) return body.trim();
  return fallback || "Error en la petición";
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: externalSignal, headers, ...fetchOptions } = options;
  const controller = new AbortController();
  let timedOut = false;

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.max(1, timeoutMs));

  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) abortFromExternal();
    else externalSignal.addEventListener("abort", abortFromExternal, { once: true });
  }

  const requestHeaders = new Headers(headers);
  if (fetchOptions.body != null && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  try {
    const res = await fetch(`${BASE}${path}`, {
      ...fetchOptions,
      credentials: "same-origin",
      headers: requestHeaders,
      signal: controller.signal,
    });

    const body = await readResponseBody(res);

    if (!res.ok) {
      throw new ApiError(
        errorMessageFromBody(body, res.statusText),
        {
          status: res.status,
          retryAfterSec: parseRetryAfter(res.headers.get("retry-after")),
          responseBody: body,
        },
      );
    }

    return body as T;
  } catch (error) {
    if (timedOut) throw new ApiTimeoutError(timeoutMs);
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}
