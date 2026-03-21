/**
 * Helper para leer reglas de programación desde BD.
 * Fallback a constantes si la regla no existe en BD (migración gradual).
 */

import { prisma } from "@/lib/db/prisma";
import { NORMAS_PROGRAMACION_BLOQUE } from "@/lib/email/emailConstants";
import {
  SCHEDULING_DEADLINE_DAY,
  SCHEDULING_DEADLINE_HOUR,
  SCHEDULING_DEADLINE_MINUTE,
  TRANSITION_MINUTES_PER_PROCEDURE,
} from "./constants";

export type ProgrammingRuleValue = string | number | { text: string } | unknown;

/** Obtiene el valor de una regla desde BD. Fallback a constantes si no existe. */
export async function getProgrammingRule(key: string): Promise<ProgrammingRuleValue | null> {
  try {
    const rule = await prisma.programmingRule.findFirst({
      where: { key, isActive: true },
    });
    if (rule?.valueJson) {
      try {
        return JSON.parse(rule.valueJson) as ProgrammingRuleValue;
      } catch {
        return rule.valueJson;
      }
    }
  } catch {
    // BD no disponible o tabla no existe
  }
  // Fallback a constantes
  const fallbacks: Record<string, ProgrammingRuleValue> = {
    normas_texto_completo: { text: NORMAS_PROGRAMACION_BLOQUE },
    scheduling_deadline_day: SCHEDULING_DEADLINE_DAY,
    scheduling_deadline_hour: SCHEDULING_DEADLINE_HOUR,
    scheduling_deadline_minute: SCHEDULING_DEADLINE_MINUTE,
    transition_minutes: TRANSITION_MINUTES_PER_PROCEDURE,
    max_weeks_ahead: 4,
  };
  return fallbacks[key] ?? null;
}

/** Obtiene el texto de normas para correos/cirujano. */
export async function getNormasTextoCompleto(): Promise<string> {
  const val = await getProgrammingRule("normas_texto_completo");
  if (val && typeof val === "object" && "text" in val && typeof (val as { text: string }).text === "string") {
    return (val as { text: string }).text;
  }
  return NORMAS_PROGRAMACION_BLOQUE;
}
