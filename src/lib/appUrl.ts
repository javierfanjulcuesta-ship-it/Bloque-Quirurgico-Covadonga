/**
 * URL pública de la aplicación para correos y enlaces.
 * En producción nunca debe apuntar a localhost.
 */

function isLocalhost(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return true;
  }
}

function isValidHttps(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * Obtiene la URL base de la aplicación para correos y enlaces públicos.
 * Prioridad: NEXT_PUBLIC_APP_URL > NEXTAUTH_URL.
 * En producción (NODE_ENV=production) no devuelve localhost.
 * @throws Error si en producción no hay URL válida o es localhost
 */
export function getAppUrl(): string {
  const url =
    (typeof process.env.NEXT_PUBLIC_APP_URL === "string" && process.env.NEXT_PUBLIC_APP_URL.trim()) ||
    (typeof process.env.NEXTAUTH_URL === "string" && process.env.NEXTAUTH_URL.trim()) ||
    "";

  const trimmed = url.trim();

  if (!trimmed) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL o NEXTAUTH_URL deben estar configurados para enviar correos. Configure la URL pública en Vercel."
    );
  }

  if (process.env.NODE_ENV === "production" && isLocalhost(trimmed)) {
    throw new Error(
      "La URL configurada apunta a localhost. En producción use la URL pública de Vercel (ej. https://mi-app.vercel.app)."
    );
  }

  if (!isValidHttps(trimmed) && process.env.NODE_ENV === "production") {
    throw new Error("La URL de la aplicación debe ser HTTPS en producción.");
  }

  return trimmed.replace(/\/$/, "");
}
