/**
 * Rate limiting best-effort en memoria.
 *
 * En serverless cada instancia mantiene su propio mapa: esto reduce ráfagas y
 * bloqueos accidentales, pero no sustituye un rate limiter distribuido (Redis/KV)
 * si el despliegue escala horizontalmente.
 */

const WINDOW_MS = 15 * 60 * 1000;
const ACCOUNT_MAX_FAILURES = 5;
const IP_MAX_FAILURES = 20;

interface Entry {
  count: number;
  firstAttemptAt: number;
  lockedUntil?: number;
}

const store = new Map<string, Entry>();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim() || "unknown";
  return "unknown";
}

function getEntryState(key: string, now: number, windowMs: number): Entry | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;

  if (entry.lockedUntil && now >= entry.lockedUntil) {
    store.delete(key);
    return undefined;
  }

  if (!entry.lockedUntil && now - entry.firstAttemptAt >= windowMs) {
    store.delete(key);
    return undefined;
  }

  return entry;
}

function recordFailure(key: string, maxFailures: number, windowMs: number): void {
  const now = Date.now();
  const current = getEntryState(key, now, windowMs);
  const entry: Entry = current ?? { count: 0, firstAttemptAt: now };
  entry.count += 1;
  if (entry.count >= maxFailures) entry.lockedUntil = now + windowMs;
  store.set(key, entry);
}

function checkKey(key: string, windowMs: number): { ok: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const entry = getEntryState(key, now, windowMs);
  if (!entry?.lockedUntil) return { ok: true };
  return {
    ok: false,
    retryAfterSec: Math.max(1, Math.ceil((entry.lockedUntil - now) / 1000)),
  };
}

/** Rate limit genérico para endpoints no-login. Esta API cuenta cada petición. */
export function checkRateLimit(
  request: Request,
  prefix: string,
  options: { windowMs?: number; maxAttempts?: number } = {}
): { ok: boolean; retryAfterSec?: number } {
  const { windowMs = WINDOW_MS, maxAttempts = 5 } = options;
  const key = `${prefix}:${getClientKey(request)}`;
  const state = checkKey(key, windowMs);
  if (!state.ok) return state;
  recordFailure(key, maxAttempts, windowMs);
  return checkKey(key, windowMs);
}

/**
 * Comprueba si un login puede intentarse sin consumir un intento.
 * Los contadores se incrementan únicamente después de una autenticación fallida.
 * Se combinan límites por cuenta y por IP para evitar tanto lockouts masivos en
 * redes compartidas como ataques distribuidos contra una única cuenta.
 */
export function checkLoginRateLimit(
  request: Request,
  email: string
): { ok: boolean; retryAfterSec?: number } {
  const normalized = normalizeEmail(email);
  const ip = getClientKey(request);
  const accountState = checkKey(`login-account:${normalized}`, WINDOW_MS);
  const ipState = checkKey(`login-ip:${ip}`, WINDOW_MS);

  if (!accountState.ok && !ipState.ok) {
    return {
      ok: false,
      retryAfterSec: Math.max(accountState.retryAfterSec ?? 0, ipState.retryAfterSec ?? 0),
    };
  }
  if (!accountState.ok) return accountState;
  if (!ipState.ok) return ipState;
  return { ok: true };
}

export function recordLoginFailure(request: Request, email: string): void {
  const normalized = normalizeEmail(email);
  const ip = getClientKey(request);
  recordFailure(`login-account:${normalized}`, ACCOUNT_MAX_FAILURES, WINDOW_MS);
  recordFailure(`login-ip:${ip}`, IP_MAX_FAILURES, WINDOW_MS);
}

/** Un login válido limpia solo el contador de esa cuenta; no el contador global de IP. */
export function resetLoginRateLimitOnSuccess(_request: Request, email: string): void {
  store.delete(`login-account:${normalizeEmail(email)}`);
}

/** Solo tests: evita contaminación entre casos. */
export function __resetRateLimitForTests(): void {
  store.clear();
}
