export function assertSeedAllowed(operation: string): void {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
    throw new Error(`${operation} está bloqueado en producción/Vercel.`);
  }
}

export function requireSeedConfirmation(variable: string, expected: string): void {
  if (process.env[variable] !== expected) {
    throw new Error(`Defina ${variable}=${expected} para confirmar explícitamente esta operación de seed.`);
  }
}

export function requireSecretEnv(variable: string, minLength = 12): string {
  const value = process.env[variable];
  if (!value || value.length < minLength) {
    throw new Error(`${variable} es obligatorio y debe tener al menos ${minLength} caracteres.`);
  }
  return value;
}
