/**
 * Contraseñas por correo (demo: localStorage).
 * En producción se gestionarían en el servidor de forma segura.
 */

const KEY = "bloque_quirurgico_passwords";

function getStore(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function setStore(store: Record<string, string>): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  }
}

export function getPasswordForEmail(email: string): string | null {
  const store = getStore();
  const key = email.trim().toLowerCase();
  return store[key] ?? null;
}

export function setPasswordForEmail(email: string, password: string): void {
  const store = getStore();
  store[email.trim().toLowerCase()] = password;
  setStore(store);
}

/** Contraseña inicial del gestor principal (solo se establece si aún no tiene). */
const INITIAL_GESTOR_EMAIL = "javier.fanjul.cuesta@gmail.com";
const INITIAL_GESTOR_PASSWORD = "Fozana30*";

export function ensureInitialGestorPassword(): void {
  if (typeof window === "undefined") return;
  const key = INITIAL_GESTOR_EMAIL.trim().toLowerCase();
  const store = getStore();
  if (store[key] == null || store[key] === "") {
    store[key] = INITIAL_GESTOR_PASSWORD;
    setStore(store);
  }
}

/** Genera una contraseña aleatoria alfanumérica de 10 caracteres. */
export function generateRandomPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
