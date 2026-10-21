/**
 * Lee las reglas de programación de la tabla ProgrammingRule.
 * Las constantes locales solo se usan cuando esa tabla no tiene ninguna fila.
 */

import {
  SCHEDULING_DEADLINE_DAY,
  SCHEDULING_DEADLINE_HOUR,
  SCHEDULING_DEADLINE_MINUTE,
  TRANSITION_MINUTES_PER_PROCEDURE,
} from "./constants";
import { NORMAS_PROGRAMACION_BLOQUE } from "@/lib/email/emailConstants";

export type ProgrammingRuleValue = string | number | { text: string } | unknown;

export interface StoredProgrammingRule {
  key: string;
  valueJson: string | null;
  isActive: boolean;
}

const FALLBACKS: Record<string, ProgrammingRuleValue> = {
  normas_texto_completo: { text: NORMAS_PROGRAMACION_BLOQUE },
  scheduling_deadline_day: SCHEDULING_DEADLINE_DAY,
  scheduling_deadline_hour: SCHEDULING_DEADLINE_HOUR,
  scheduling_deadline_minute: SCHEDULING_DEADLINE_MINUTE,
  transition_minutes: TRANSITION_MINUTES_PER_PROCEDURE,
  max_weeks_ahead: 4,
};

export function parseProgrammingRuleValue(valueJson: string | null): ProgrammingRuleValue | null {
  if (valueJson == null || valueJson.trim() === "") return null;
  try {
    return JSON.parse(valueJson) as ProgrammingRuleValue;
  } catch {
    return valueJson;
  }
}

/** Si `rows` está vacío, devuelve la constante. Si hay filas, solo vale la fila activa de esa clave. */
export function resolveProgrammingRule(key: string, rows: StoredProgrammingRule[]): ProgrammingRuleValue | null {
  if (rows.length === 0) return FALLBACKS[key] ?? null;
  const row = rows.find((item) => item.key === key && item.isActive);
  if (!row) return null;
  return parseProgrammingRuleValue(row.valueJson);
}

export async function getProgrammingRule(key: string): Promise<ProgrammingRuleValue | null> {
  const { prisma } = await import("@/lib/db/prisma");
  const rows = await prisma.programmingRule.findMany({
    select: { key: true, valueJson: true, isActive: true },
  });
  return resolveProgrammingRule(key, rows);
}

/** Texto de normas para correos y para el cirujano. */
export async function getNormasTextoCompleto(): Promise<string> {
  const val = await getProgrammingRule("normas_texto_completo");
  if (val && typeof val === "object" && "text" in val && typeof (val as { text: string }).text === "string") {
    return (val as { text: string }).text;
  }
  return NORMAS_PROGRAMACION_BLOQUE;
}
