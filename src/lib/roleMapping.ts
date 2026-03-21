/**
 * Mapeo entre roles de Prisma (enum) y formato del frontend (string).
 */

import type { UserRole } from "@prisma/client";

export type FrontendRole = "gestor" | "anestesista" | "cirujano" | "endoscopista" | "gestor-anestesista";

const TO_FRONTEND: Record<UserRole, FrontendRole> = {
  GESTOR: "gestor",
  ANESTESISTA: "anestesista",
  CIRUJANO: "cirujano",
  ENDOSCOPISTA: "endoscopista",
  GESTOR_ANESTESISTA: "gestor-anestesista",
};

const TO_PRISMA: Record<string, UserRole> = {
  gestor: "GESTOR",
  anestesista: "ANESTESISTA",
  cirujano: "CIRUJANO",
  endoscopista: "ENDOSCOPISTA",
  "gestor-anestesista": "GESTOR_ANESTESISTA",
};

export function roleToFrontend(role: UserRole | string): FrontendRole {
  if (role in TO_FRONTEND) return TO_FRONTEND[role as UserRole];
  if (role in TO_PRISMA) return role as FrontendRole;
  return "gestor";
}

export function roleToPrisma(role: string): UserRole | null {
  const r = role.trim().toLowerCase();
  if (r in TO_PRISMA) return TO_PRISMA[r];
  if (r === "gestor_anestesista" || r === "gestor-anestesista") return "GESTOR_ANESTESISTA";
  return null;
}

export function isCirujanoOrEndoscopista(role: UserRole | string): boolean {
  return role === "CIRUJANO" || role === "ENDOSCOPISTA";
}
