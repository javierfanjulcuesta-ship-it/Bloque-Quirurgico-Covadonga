/**
 * Construcción de correos de invitación/alta de usuario.
 * Contenido distinto por rol: ANESTESISTA, GESTOR, GESTOR_ANESTESISTA.
 * GESTOR y GESTOR_ANESTESISTA comparten estructura base; GESTOR_ANESTESISTA añade mención de rol dual.
 */

import type { UserRole } from "@/lib/types";
import { NORMAS_PROGRAMACION_BLOQUE } from "@/lib/email/emailConstants";
import { buildMobileInstallInstructions } from "@/lib/email/mobileInstallInstructions";

export interface BuildInvitationEmailParams {
  /** Nombre del destinatario */
  name: string;
  /** Correo del destinatario (para referencia) */
  email: string;
  role: UserRole;
  /** Quién invita (ej. "Javier Fanjul") */
  invitedByName?: string;
  /** URL de acceso a la aplicación */
  appUrl: string;
  /** Contraseña temporal generada */
  temporaryPassword: string;
  /** Enlace de reinicio (futuro; si existe, puede sustituir contraseña en el flujo) */
  resetLink?: string;
  /** Normas de programación (desde BD; fallback a constante si no se pasa) */
  normasTexto?: string;
}

export interface InvitationEmailResult {
  subject: string;
  text: string;
  html?: string;
}

const BLOQUE_ACCESO_TEMPLATE = `
ACCESO A LA APLICACIÓN

Acceder a la aplicación: [ENLACE_ACCESO]

Usuario: su correo electrónico (el mismo al que llega este mensaje)
Contraseña inicial: [CONTRASENA_INICIAL]

Recomendación de seguridad: cambie su contraseña tras el primer acceso desde "Mi perfil" en la aplicación.

Requisitos y seguridad
• Compatibilidad: use un navegador actualizado (Chrome, Firefox, Edge o Safari) en ordenador o tablet.
• Seguridad: la aplicación es de uso interno. Utilice conexiones seguras y no comparta su contraseña.
[INSTRUCCIONES_MOVIL]
`;

function buildAccessBlock(appUrl: string, temporaryPassword: string): string {
  const link = appUrl.trim() || "[enlace a la aplicación]";
  const pwd = temporaryPassword.trim() || "[contraseña inicial]";
  const { text: mobileText } = buildMobileInstallInstructions(link);
  return BLOQUE_ACCESO_TEMPLATE
    .replace("[ENLACE_ACCESO]", link)
    .replace("[CONTRASENA_INICIAL]", pwd)
    .replace("[INSTRUCCIONES_MOVIL]", mobileText);
}

/** Construcción simplificada: convierte texto plano a HTML básico */
function toSimpleHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const withBreaks = escaped.replace(/\n/g, "<br>");
  const linkified = withBreaks.replace(
    /(https:\/\/[^\s<>"']+)/g,
    '<a href="$1" style="color: #0066cc;">$1</a>'
  );
  return `<div style="font-family: sans-serif; line-height: 1.5; color: #333;">${linkified}</div>`;
}

// --- ANESTESISTA ---
const ASUNTO_ANESTESISTA = "Acceso a la aplicación de programación del bloque quirúrgico – Anestesia";

function buildAnesthetistBody(params: BuildInvitationEmailParams): string {
  const nombre = params.name.trim() || "Compañero/a";
  const lineaInvitacion = params.invitedByName
    ? `${params.invitedByName} le invita a acceder al sistema.`
    : "Ha sido invitado/a a acceder al sistema.";
  const acceso = buildAccessBlock(params.appUrl, params.temporaryPassword);

  return `Estimado/a ${nombre},

Bienvenido/a al sistema de gestión y programación del bloque quirúrgico del Hospital Covadonga.

Con esta aplicación podrá:
• Consultar su agenda y asignaciones de anestesia
• Ver la programación del bloque quirúrgico
• Indicar días o turnos de no disponibilidad para mejorar la planificación

${lineaInvitacion}

${acceso}
Si tiene dudas, puede contactar con la coordinación del bloque a través de la aplicación.

Un cordial saludo,
Coordinación del Bloque Quirúrgico
Hospital Covadonga – Grupo Ribera`;
}

// --- GESTOR (base compartida con GESTOR_ANESTESISTA) ---
const ASUNTO_GESTOR = "Invitación de acceso – Gestión del Bloque Quirúrgico Hospital Covadonga";

function buildGestorBody(params: BuildInvitationEmailParams, isGestorAnestesista: boolean): string {
  const nombre = params.name.trim() || "Estimado/a";
  const rolLabel = isGestorAnestesista ? "gestor-anestesista" : "gestor";
  const lineaInvitador = params.invitedByName
    ? `\nLe invita: ${params.invitedByName}.`
    : "";
  const acceso = buildAccessBlock(params.appUrl, params.temporaryPassword);

  const rolExtra = isGestorAnestesista
    ? `
Además, como gestor-anestesista podrá operar en la agenda como anestesista y gestionar sus propias asignaciones cuando corresponda.
`
    : "";

  return `Estimado/a ${nombre},

Ha sido invitado/a a acceder a la aplicación de Gestión del Bloque Quirúrgico – Hospital Covadonga (Grupo Ribera) con perfil de ${rolLabel}.${lineaInvitador}

Esta herramienta permite organizar y supervisar la programación quirúrgica del bloque. Desde el perfil de gestor podrá:
• Visualizar el calendario completo del bloque
• Supervisar la programación de intervenciones
• Gestionar incidencias o cambios en la agenda
• Crear usuarios y enviar invitaciones
• Revisar mensajes de los profesionales
• Configurar el plan de apertura del bloque
${rolExtra}
Para acceder al sistema:
${acceso}
La primera vez que acceda se le solicitará completar datos básicos de contacto. Es un paso breve.

Un cordial saludo,
Coordinación del Bloque Quirúrgico
Hospital Covadonga – Grupo Ribera`;
}

// --- CIRUJANO y ENDOSCOPISTA (mantener compatibilidad con flujo actual) ---
const ASUNTO_CIRUJANO = "Organización de la programación del bloque quirúrgico y nueva función de contacto";
const ASUNTO_ENDOSCOPISTA = "Acceso a la aplicación de programación del bloque quirúrgico – Endoscopista/otros";

function buildCirujanoBody(params: BuildInvitationEmailParams): string {
  const acceso = buildAccessBlock(params.appUrl, params.temporaryPassword);
  const normas = params.normasTexto ?? NORMAS_PROGRAMACION_BLOQUE;
  return `Estimados/as compañeros/as,

Le damos la bienvenida al sistema de programación del bloque quirúrgico del Hospital Covadonga.

Podrá consultar el calendario, reservar huecos y programar pacientes. Normas de programación y reserva del bloque:

${normas}

La primera vez que acceda complete los datos de contacto para mantener comunicación fluida.

${acceso}

Un cordial saludo,
Coordinación del Bloque Quirúrgico
Hospital Covadonga – Grupo Ribera`;
}

function buildEndoscopistaBody(params: BuildInvitationEmailParams): string {
  const acceso = buildAccessBlock(params.appUrl, params.temporaryPassword);
  const normas = params.normasTexto ?? NORMAS_PROGRAMACION_BLOQUE;
  return `Estimado/a compañero/a,

Le damos la bienvenida al sistema de programación del bloque quirúrgico con perfil de Endoscopista.

Podrá reservar huecos en Procedimientos menores y Técnicas del dolor (no en Q1, Q2, Q3). Normas de programación y reserva del bloque:

${normas}

${acceso}

Un cordial saludo,
Coordinación del Bloque Quirúrgico
Hospital Covadonga – Grupo Ribera`;
}

/** Construye el correo de invitación completo según el rol. */
export function buildInvitationEmail(params: BuildInvitationEmailParams): InvitationEmailResult {
  const { role } = params;
  let subject: string;
  let text: string;

  switch (role) {
    case "anestesista":
      subject = ASUNTO_ANESTESISTA;
      text = buildAnesthetistBody(params);
      break;
    case "gestor":
      subject = ASUNTO_GESTOR;
      text = buildGestorBody(params, false);
      break;
    case "gestor-anestesista":
      subject = ASUNTO_GESTOR;
      text = buildGestorBody(params, true);
      break;
    case "cirujano":
      subject = ASUNTO_CIRUJANO;
      text = buildCirujanoBody(params);
      break;
    case "endoscopista":
      subject = ASUNTO_ENDOSCOPISTA;
      text = buildEndoscopistaBody(params);
      break;
    default:
      subject = ASUNTO_GESTOR;
      text = buildGestorBody(params, false);
  }

  return {
    subject,
    text,
    html: toSimpleHtml(text),
  };
}
