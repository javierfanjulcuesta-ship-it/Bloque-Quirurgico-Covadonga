/**
 * Script para previsualizar correos de invitación sin enviar.
 * Uso: npx tsx scripts/preview-invitation-email.ts [anestesista|gestor|gestor-anestesista]
 */

import { buildInvitationEmail } from "../src/lib/email/invitationEmail";

const EXAMPLE = {
  name: "María García",
  email: "maria.garcia@hospital.local",
  invitedByName: "Javier Fanjul",
  appUrl: "https://mi-app.vercel.app",
  temporaryPassword: "Temp-2026-Acceso",
};

const ROLES = ["anestesista", "gestor", "gestor-anestesista"] as const;

function main() {
  const roleArg = process.argv[2] ?? "anestesista";
  if (!ROLES.includes(roleArg as (typeof ROLES)[number])) {
    console.error(`Uso: npx tsx scripts/preview-invitation-email.ts [${ROLES.join("|")}]`);
    process.exit(1);
  }

  const role = roleArg as (typeof ROLES)[number];
  const { subject, text, html } = buildInvitationEmail({
    ...EXAMPLE,
    role,
  });

  console.log("\n=== CORREO DE INVITACIÓN:", role.toUpperCase(), "===\n");
  console.log("ASUNTO:", subject);
  console.log("\n--- TEXTO PLANO ---\n");
  console.log(text);
  console.log("\n--- FIN TEXTO PLANO ---\n");
  if (html) {
    console.log("--- HTML (primeros 500 caracteres) ---\n");
    console.log(html.slice(0, 500) + (html.length > 500 ? "..." : ""));
    console.log("\n--- FIN HTML ---\n");
  }
}

main();
