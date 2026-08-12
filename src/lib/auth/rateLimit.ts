/**
 * Rate limiting simple en memoria.
 *
 * En serverless cada instancia mantiene su propio mapa, por lo que esto mitiga
 * ráfagas y abuso oportunista pero no sustituye un rate limiter distribuido.
 * Para producción a gran escala conviene usar Redis/KV compartido.
 */

import { createHash } from "node:crypto";

const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 min de bloqueo tras 5 intentos fallidos
const MAX_KEY_PART_LENGTH = 128;

interface Entry {
  count: number;
  firstAttemptAt: number;
  lockedUntil?: number;
}

const store = new Map<string, Entry>();

function cleanKeyPart(value: string): string {
  return value.trim().slice(0, MAX_KEY_PART_LENGTH) || "unknown";
}

export function getClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return cleanKeyPart(forwarded.split(",")[0] ?? "unknown");
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return cleanKeyPart(realIp);
  return "unknown";
}

function identityKey(identity: string): string {
  const normalized = identity.trim().toLowerCase();
  if (!normalized) return "anonymous";
  // No conservamos el email en claro dentro del mapa de proceso.
  return createHash("sha256").update(normalized).digest("hex").slice(0, 24);
}

function consumeAttempt(
  key: string,
  options: { windowMs: number; maxAttempts: number; lockoutMs: number }
): { ok: boolean; retryAfterSec?: number } {
  const { windowMs, maxAttempts, lockoutMs } = options;
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
  // maxAttempts significa intentos permitidos; el siguiente activa el bloqueo.
  if (entry.count > maxAttempts) {
    entry.lockedUntil = now + lockoutMs;
    return { ok: false, retryAfterSec: Math.ceil(lockoutMs / 1000) };
  }

  return { ok: true };
}

/** Rate limit genérico: prefix distinto por endpoint, ventana y máximo configurables. */
export function checkRateLimit(
  request: Request,
  prefix: string,
  options: { windowMs?: number; maxAttempts?: number } = {}
): { ok: boolean; retryAfterSec?: number } {
  const { windowMs = WINDOW_MS, maxAttempts = 5 } = options;
  const key = `${cleanKeyPart(prefix)}:${getClientKey(request)}`;
  return consumeAttempt(key, { windowMs, maxAttempts, lockoutMs: windowMs });
}

/**
 * Limita login por combinación IP + identidad.
 *
 * El limitador anterior usaba solo IP, lo que permitía que un usuario bloqueara
 * accidental o maliciosamente a todos los compañeros detrás del mismo NAT del
 * hospital. Mantener también la IP evita que una identidad pueda probarse desde
 * una misma fuente sin límite, pero usuarios distintos no comparten contador.
 */
export function checkLoginRateLimit(
  request: Request,
  identity: string
): { ok: boolean; retryAfterSec?: number } {
  const key = `login:${getClientKey(request)}:${identityKey(identity)}`;
  return consumeAttempt(key, {
    windowMs: WINDOW_MS,
    maxAttempts: MAX_ATTEMPTS,
    lockoutMs: LOCKOUT_MS,
  });
}

export function resetLoginRateLimitOnSuccess(request: Request, identity: string): void {
  const key = `login:${getClientKey(request)}:${identityKey(identity)}`;
  store.delete(key);
}
