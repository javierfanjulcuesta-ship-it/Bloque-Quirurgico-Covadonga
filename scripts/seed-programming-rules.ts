/**
 * Seed de reglas de programación editables.
 * Ejecutar: npx tsx scripts/seed-programming-rules.ts
 * Ejecuta upsert: crea si no existen, no sobrescribe si ya hay valores.
 */

import { PrismaClient } from "@prisma/client";
import { NORMAS_PROGRAMACION_BLOQUE } from "../src/lib/email/emailConstants";
import {
  SCHEDULING_DEADLINE_DAY,
  SCHEDULING_DEADLINE_HOUR,
  SCHEDULING_DEADLINE_MINUTE,
  TRANSITION_MINUTES_PER_PROCEDURE,
} from "../src/lib/constants";

const prisma = new PrismaClient();

const RULES = [
  {
    key: "normas_texto_completo",
    name: "Normas de programación del bloque quirúrgico",
    description: "Texto completo mostrado en correos y pestaña Normas (solo lectura para cirujano)",
    category: "informational",
    valueJson: JSON.stringify({ text: NORMAS_PROGRAMACION_BLOQUE }),
  },
  {
    key: "scheduling_deadline_day",
    name: "Día de cierre (0=Dom, 4=Jueves)",
    description: "Día de la semana en que cierra la reserva (jueves=4)",
    category: "scheduling",
    valueJson: JSON.stringify(SCHEDULING_DEADLINE_DAY),
  },
  {
    key: "scheduling_deadline_hour",
    name: "Hora de cierre",
    description: "Hora del día de cierre (0-23)",
    category: "scheduling",
    valueJson: JSON.stringify(SCHEDULING_DEADLINE_HOUR),
  },
  {
    key: "scheduling_deadline_minute",
    name: "Minuto de cierre",
    description: "Minuto de la hora de cierre (0-59)",
    category: "scheduling",
    valueJson: JSON.stringify(SCHEDULING_DEADLINE_MINUTE),
  },
  {
    key: "transition_minutes",
    name: "Minutos transición por procedimiento",
    description: "Minutos extra por procedimiento (limpieza, anestesia)",
    category: "scheduling",
    valueJson: JSON.stringify(TRANSITION_MINUTES_PER_PROCEDURE),
  },
  {
    key: "max_weeks_ahead",
    name: "Semanas máximas por delante",
    description: "Cuántas semanas hacia adelante se puede reservar",
    category: "scheduling",
    valueJson: JSON.stringify(4),
  },
];

async function main() {
  for (const r of RULES) {
    await prisma.programmingRule.upsert({
      where: { key: r.key },
      create: {
        key: r.key,
        name: r.name,
        description: r.description,
        category: r.category,
        valueJson: r.valueJson,
        isActive: true,
      },
      update: {}, // No sobrescribir si ya existe
    });
    console.log(`Regla: ${r.key}`);
  }
  console.log("\n--- Reglas de programación listas ---");
  console.log("Ejecutar migración si no lo has hecho: npx prisma db push");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
