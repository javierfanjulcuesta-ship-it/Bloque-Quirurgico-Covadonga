/**
 * Validación de fuerza de contraseña.
 * Mínimo 8 caracteres, al menos una letra y un número.
 */

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;

export interface PasswordValidationResult {
  valid: boolean;
  error?: string;
}

export function validatePasswordStrength(password: string): PasswordValidationResult {
  if (!password || typeof password !== "string") {
    return { valid: false, error: "La contraseña es obligatoria." };
  }
  if (password.length < MIN_LENGTH) {
    return { valid: false, error: `La contraseña debe tener al menos ${MIN_LENGTH} caracteres.` };
  }
  if (password.length > MAX_LENGTH) {
    return { valid: false, error: `La contraseña no puede superar ${MAX_LENGTH} caracteres.` };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, error: "La contraseña debe contener al menos una letra." };
  }
  if (!/\d/.test(password)) {
    return { valid: false, error: "La contraseña debe contener al menos un número." };
  }
  return { valid: true };
}
