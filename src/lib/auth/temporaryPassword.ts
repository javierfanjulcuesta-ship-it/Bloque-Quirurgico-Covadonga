import { randomInt } from "node:crypto";

const DEFAULT_LENGTH = 14;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Genera contraseñas temporales con CSPRNG; evita caracteres ambiguos. */
export function generateTemporaryPassword(length = DEFAULT_LENGTH): string {
  if (!Number.isInteger(length) || length < 12 || length > 128) {
    throw new Error("Temporary password length must be between 12 and 128 characters");
  }
  let password = "";
  for (let i = 0; i < length; i++) {
    password += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return password;
}
