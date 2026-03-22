/**
 * Rate limiting simple en memoria para login.
 * En serverless cada instancia tiene su propio mapa; mitiga rápidas ráfagas.
 * Para producción a gran escala, usar Redis (Upstash, Vercel KV).
 */

const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 min de bloqueo tras 5 fallos

interface Entry {
  count: number;
  firstAttemptAt: number;
  lockedUntil?: number;
}

const store = new Map<string, Entry>();

export function getClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

/** Rate limit genérico: prefix distinto por endpoint, ventana y máximo configurables. */
export function checkRateLimit(
  request: Request,
  prefix: string,
  options: { windowMs?: number; maxAttempts?: number } = {}
): { ok: boolean; retryAfterSec?: number } {
  const { windowMs = WINDOW_MS, maxAttempts = 5 } = options;
  const key = `${prefix}:${getClientKey(request)}`;
  const now = Date.now();
  let entry = store.get(key);

  if (!entry) {
    entry = { count: 0, firstAttemptAt: now };
    store.set(key, entry);
  }

  if (entry.lockedUntil && now < entry.lockedUntil) {
    return { ok: false, retryAfterSec: Math.ceil((entry.lockedUntil - now) / 1000) };
  }

  if (entry.lockedUntil && now >= entry.lockedUntil) {
    entry.count = 0;
    entry.firstAttemptAt = now;
    entry.lockedUntil = undefined;
  }

  if (now - entry.firstAttemptAt > windowMs) {
    entry.count = 0;
    entry.firstAttemptAt = now;
  }

  entry.count++;
  if (entry.count >= maxAttempts) {
    entry.lockedUntil = now + windowMs;
    return { ok: false, retryAfterSec: Math.ceil(windowMs / 1000) };
  }
  return { ok: true };
}

export function checkLoginRateLimit(request: Request): { ok: boolean; retryAfterSec?: number } {
  const key = `login:${getClientKey(request)}`;
  const now = Date.now();
  let entry = store.get(key);

  if (!entry) {
    entry = { count: 0, firstAttemptAt: now };
    store.set(key, entry);
  }

  if (entry.lockedUntil && now < entry.lockedUntil) {
    return { ok: false, retryAfterSec: Math.ceil((entry.lockedUntil - now) / 1000) };
  }

  if (entry.lockedUntil && now >= entry.lockedUntil) {
    entry.count = 0;
    entry.firstAttemptAt = now;
    entry.lockedUntil = undefined;
  }

  if (now - entry.firstAttemptAt > WINDOW_MS) {
    entry.count = 0;
    entry.firstAttemptAt = now;
  }

  entry.count++;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_MS;
    return { ok: false, retryAfterSec: LOCKOUT_MS / 1000 };
  }
  return { ok: true };
}

export function resetLoginRateLimitOnSuccess(request: Request): void {
  const key = `login:${getClientKey(request)}`;
  store.delete(key);
}
