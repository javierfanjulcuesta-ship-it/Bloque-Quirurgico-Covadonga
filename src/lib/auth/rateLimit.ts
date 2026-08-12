/**
 * Rate limiting simple en memoria.
 *
 * En serverless cada instancia mantiene su propio mapa, por lo que esto mitiga
 * ráfagas y abuso oportunista pero no sustituye un rate limiter distribuido.
 * Para producción a gran escala conviene usar Redis/KV compartido.
 *
 * El almacén está acotado y se purga periódicamente: un atacante no puede hacer
 * crecer indefinidamente la memoria del proceso generando claves/IP distintas.
 */

import { createHash } from "node:crypto";

const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 min de bloqueo tras 5 intentos fallidos
const MAX_KEY_PART_LENGTH = 128;
const MAX_STORE_ENTRIES = 10_000;
const SWEEP_INTERVAL = 256;

interface Entry {
  count: number;
  firstAttemptAt: number;
  expiresAt: number;
  lockedUntil?: number;
}

const store = new Map<string, Entry>();
let operationsSinceSweep = 0;

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

function entryIsExpired(entry: Entry, now: number): boolean {
  if (entry.lockedUntil) return entry.lockedUntil <= now;
  return entry.expiresAt <= now;
}

function sweepStore(now: number): void {
  for (const [key, entry] of store) {
    if (entryIsExpired(entry, now)) store.delete(key);
  }

  if (store.size <= MAX_STORE_ENTRIES) return;

  // Map conserva orden de inserción. Las entradas más antiguas son las primeras;
  // expulsarlas limita memoria sin permitir que una clave nueva invalide todo el mapa.
  const excess = store.size - MAX_STORE_ENTRIES;
  let removed = 0;
  for (const key of store.keys()) {
    store.delete(key);
    removed++;
    if (removed >= excess) break;
  }
}

function maintainStore(now: number): void {
  operationsSinceSweep++;
  if (operationsSinceSweep < SWEEP_INTERVAL && store.size <= MAX_STORE_ENTRIES) return;
  operationsSinceSweep = 0;
  sweepStore(now);
}

function consumeAttempt(
  key: string,
  options: { windowMs: number; maxAttempts: number; lockoutMs: number }
): { ok: boolean; retryAfterSec?: number } {
  const { windowMs, maxAttempts, lockoutMs } = options;
  const now = Date.now();
  maintainStore(now);

  let entry = store.get(key);

  if (entry && entryIsExpired(entry, now)) {
    store.delete(key);
    entry = undefined;
  }

  if (!entry) {
    entry = {
      count: 0,
      firstAttemptAt: now,
      expiresAt: now + windowMs,
    };
    store.set(key, entry);
  }

  if (entry.lockedUntil && now < entry.lockedUntil) {
    return { ok: false, retryAfterSec: Math.ceil((entry.lockedUntil - now) / 1000) };
  }

  // Defensa adicional si cambia la ventana entre llamadas para una misma clave.
  if (now >= entry.expiresAt) {
    entry.count = 0;
    entry.firstAttemptAt = now;
    entry.expiresAt = now + windowMs;
    entry.lockedUntil = undefined;
  }

  entry.count++;
  // maxAttempts significa intentos permitidos; el siguiente activa el bloqueo.
  if (entry.count > maxAttempts) {
    entry.lockedUntil = now + lockoutMs;
    entry.expiresAt = entry.lockedUntil;
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
