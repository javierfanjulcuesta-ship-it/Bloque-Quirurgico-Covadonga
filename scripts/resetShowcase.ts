/**
 * Borra datos operativos de showcase: eventos de reserva, pacientes en bloque y reservas.
 * No elimina usuarios, reglas de programación (ProgrammingRule), planes de apertura, mensajes de contacto, etc.
 *
 * Uso:
 *   npm run reset:showcase
 *
 * Sin confirmación (CI / automatización):
 *   set SKIP_RESET_CONFIRM=1 && npm run reset:showcase   (Windows)
 *   SKIP_RESET_CONFIRM=1 npm run reset:showcase        (Unix)
 */

import * as readline from "node:readline";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function question(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const skip = process.env.SKIP_RESET_CONFIRM === "1" || process.env.SKIP_RESET_CONFIRM === "true";
  if (!skip) {
    console.log(
      "\nSe eliminarán TODAS las filas de: ReservationEvent, PatientInBlock, Reservation.\n" +
        "No se tocan User, ProgrammingRule, BlockOpeningPlan, AnesthetistAssignment, ContactMessage, etc.\n"
    );
    const answer = (await question('Para continuar escribe exactamente: SHOWCASE\n> ')).trim();
    if (answer !== "SHOWCASE") {
      console.log("Cancelado (no se ha borrado nada).");
      return;
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const events = await tx.reservationEvent.deleteMany();
    const patients = await tx.patientInBlock.deleteMany();
    const reservations = await tx.reservation.deleteMany();
    return { events, patients, reservations };
  });

  console.log(
    `\nListo. Eliminados: ${result.events.count} eventos, ${result.patients.count} pacientes en bloque, ${result.reservations.count} reservas.\n`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
