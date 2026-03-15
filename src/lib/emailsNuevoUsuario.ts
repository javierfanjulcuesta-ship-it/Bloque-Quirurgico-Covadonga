/**
 * Plantillas de email para nuevo usuario por perfil.
 * Se usa al crear un usuario desde el gestor; el correo se abre en el cliente de correo.
 */

import type { UserRole } from "./types";

const ASUNTO_CIRUJANO = "Organización de la programación del bloque quirúrgico y nueva función de contacto";
const ASUNTO_ANESTESISTA = "Acceso a la aplicación de programación del bloque quirúrgico – Anestesia";
const ASUNTO_GESTOR = "Invitación de acceso – Gestión del Bloque Quirúrgico Hospital Covadonga";
const ASUNTO_ENDOSCOPISTA = "Acceso a la aplicación de programación del bloque quirúrgico – Endoscopista/otros";

const BLOQUE_ACCESO = `
ACCESO A LA APLICACIÓN
Enlace: [ENLACE_ACCESO]
Usuario: su correo electrónico (el mismo al que llega este mensaje)
Contraseña inicial: [CONTRASENA_INICIAL]
Puede cambiar su contraseña en cualquier momento desde la aplicación, en la pestaña "Mi perfil".
`;

const NOTA_COMPATIBILIDAD_SEGURIDAD = `

Requisitos y seguridad
• Compatibilidad: se recomienda usar un navegador actualizado (Chrome, Firefox, Edge o Safari) en ordenador o tablet. Evite dispositivos o navegadores obsoletos para evitar problemas de visualización o uso.
• Seguridad: la aplicación es de uso interno y los datos se tratan con confidencialidad y de acuerdo con la normativa de protección de datos. Utilice conexiones seguras (evite redes públicas no fiables) y no comparta su contraseña.
`;

/** Texto completo de las normas de programación y reserva del bloque (para correos de cirujanos/endoscopistas y para la app). */
export const NORMAS_PROGRAMACION_BLOQUE = `
• Los quirófanos (Q1, Q2, Q3) y las salas de procedimientos menores y técnicas del dolor funcionan en régimen compartido según el perfil de cada profesional: cirujanos pueden reservar en quirófanos y procedimientos menores; endoscopistas, en procedimientos menores y técnicas del dolor.

• Días laborables: solo es posible reservar de lunes a viernes.

• Cierre de la semana siguiente: el jueves de la semana 1 a las 00:00 se cierra la posibilidad de reserva de toda la semana 2. Para la semana 2 solo se puede programar directamente pacientes en los huecos libres (no reservar huecos sin pacientes). El resto de semanas permanecen abiertas hasta un máximo de 4 semanas por delante.

• Los miércoles se envía un recordatorio automático a quienes tengan huecos reservados sin pacientes programados. Los huecos no completos o sin pacientes en el momento del cierre del jueves se liberan automáticamente para otros profesionales.

• Los primeros tramos de la mañana y de la tarde requieren una reserva mínima de 1 hora y 30 minutos.

• En un mismo bloque reservado se pueden incluir varios pacientes, según la duración estimada de los procedimientos. A cada procedimiento se le suman 10 minutos de limpieza, anestesia y colocación.

• Los pacientes programados se asignan automáticamente a la consulta de preanestesia disponible (lunes y jueves por la mañana).

• Uso del tiempo reservado: si el tiempo reservado por un cirujano o endoscopista durante 3 semanas consecutivas es liberado por falta de pacientes programados en más de un 50% durante las dos semanas siguientes, dicho profesional solo podrá programar pacientes directamente en huecos libres y no podrá realizar nuevas reservas de huecos hasta que la coordinación revise su situación.

• Contacto con la coordinación: en el perfil de la aplicación está la sección "Contactar al gestor" para enviar un mensaje (asunto y texto). El mensaje queda registrado y, si el gestor tiene correo en el sistema, se abrirá el cliente de correo para enviarlo. Cualquier duda o incidencia puede resolverse así de forma ágil.
`.trim();

const CUERPO_CIRUJANO_BASE = `Estimados/as compañeros/as,

Con el objetivo de mejorar la organización y previsibilidad del bloque quirúrgico, optimizar el uso de los quirófanos y facilitar la coordinación entre los distintos equipos implicados, se ha puesto en marcha un sistema de programación de la actividad quirúrgica a través de una aplicación específica de gestión del bloque quirúrgico.

Mediante esta herramienta podréis consultar el calendario del bloque y reservar de forma sencilla los huecos disponibles en los quirófanos o en la sala de procedimientos menores. Para asegurar un funcionamiento ordenado y eficiente, os rogamos tener en cuenta las siguientes normas de programación y reserva del bloque:
[NORMAS]
La primera vez que accedáis al sistema se os pedirá completar algunos datos básicos de contacto; es un paso rápido que nos permite mantener una comunicación fluida ante incidencias o cambios en la programación.

Agradecemos de antemano vuestra colaboración y os animamos a trasladarnos cualquier duda, sugerencia o mejora que consideréis útil. Nuestro objetivo es que el sistema sea práctico y contribuya a la organización y al mejor aprovechamiento del bloque quirúrgico.

Un cordial saludo,
Coordinación del Bloque Quirúrgico
Hospital Covadonga – Grupo Ribera`;

const CUERPO_ANESTESISTA = `Estimado/a Compañero/a,

Queríamos darte la bienvenida al sistema de gestión y programación del bloque quirúrgico del Hospital Covadonga.

Con esta herramienta buscamos facilitar la organización de la actividad quirúrgica y mejorar la coordinación entre los distintos profesionales implicados en el proceso quirúrgico.

A través de la aplicación podrás consultar la programación del bloque, revisar tu agenda de anestesia y, si lo deseas, indicar aquellos días o turnos en los que prefieres no trabajar, lo que nos ayudará a organizar la planificación de la forma más eficiente posible.

La primera vez que accedas al sistema se te pedirá que completes algunos datos básicos de contacto. Este paso es rápido y nos permitirá mantener una comunicación fluida ante cualquier incidencia o cambio en la programación.

Si en algún momento tienes cualquier duda, sugerencia o detectas algo que pueda mejorarse, no dudes en comentárnoslo. Nuestro objetivo es que el sistema sea lo más útil y sencillo posible para todos.

Muchas gracias por tu colaboración.

Un cordial saludo,
Javier Fanjul Cuesta
 Coordinación del Bloque Quirúrgico
Hospital Covadonga – Grupo Ribera`;

const CUERPO_GESTOR = `Estimado/a [Nombre],

Ha sido invitado/a a acceder a la aplicación Sistema de Gestión del Bloque Quirúrgico – Hospital Covadonga (Grupo Ribera) con perfil de gestor.

Esta herramienta permite organizar y supervisar la programación quirúrgica del bloque, facilitando la coordinación entre los distintos profesionales implicados en la actividad quirúrgica.

Desde el perfil de gestor podrá, entre otras funciones:

Visualizar el calendario completo del bloque quirúrgico

Supervisar la programación de intervenciones

Gestionar incidencias o cambios en la agenda

Revisar los mensajes enviados por los profesionales a través de la aplicación

Para acceder al sistema, utilice el siguiente enlace:

[ENLACE DE ACCESO]

La primera vez que acceda se le solicitará completar algunos datos básicos de contacto. Este proceso es breve y permitirá mantener una comunicación más ágil ante cualquier incidencia o actualización relacionada con la programación.

Si tiene cualquier duda durante el acceso o uso de la aplicación, no dude en ponerse en contacto con la coordinación del bloque quirúrgico.

Muchas gracias por su colaboración.

Un cordial saludo,
Coordinación del Bloque Quirúrgico
Hospital Covadonga – Grupo Ribera`;

const CUERPO_ENDOSCOPISTA = `Estimado/a compañero/a,

Le damos la bienvenida a la aplicación de programación del bloque quirúrgico del Hospital Covadonga con perfil de Endoscopista/otros.

Con esta herramienta podrá consultar el calendario y reservar huecos en las zonas de Procedimientos menores y Técnicas del dolor (no en los quirófanos Q1, Q2, Q3). El uso del calendario, reservas, pacientes programados y procedimientos realizados es el mismo que en el perfil de cirujano. Le rogamos tener en cuenta las siguientes normas de programación y reserva del bloque:
[NORMAS]
La primera vez que acceda se le pedirá completar algunos datos de contacto para mantener una comunicación fluida. Quedamos a su disposición.

Un cordial saludo,

Coordinación del Bloque Quirúrgico
Hospital Covadonga – Grupo Ribera`;

export function getEmailSubject(role: UserRole): string {
  switch (role) {
    case "cirujano":
      return ASUNTO_CIRUJANO;
    case "anestesista":
      return ASUNTO_ANESTESISTA;
    case "gestor":
    case "gestor-anestesista":
      return ASUNTO_GESTOR;
    case "endoscopista":
      return ASUNTO_ENDOSCOPISTA;
  }
}

export interface EmailBodyOptions {
  /** Nombre del destinatario (para plantilla gestor: sustituye [Nombre]) */
  recipientName?: string;
  /** URL de acceso al sistema */
  accessLink?: string;
  /** Contraseña inicial generada (el usuario puede cambiarla en Mi perfil) */
  initialPassword?: string;
}

function buildAccessAndSecuritySuffix(options?: EmailBodyOptions): string {
  const link = options?.accessLink?.trim() || "[enlace a la aplicación]";
  const password = options?.initialPassword?.trim() || "[contraseña inicial]";
  const block = BLOQUE_ACCESO.replace("[ENLACE_ACCESO]", link).replace("[CONTRASENA_INICIAL]", password);
  return block + NOTA_COMPATIBILIDAD_SEGURIDAD;
}

export function getEmailBody(role: UserRole, options?: EmailBodyOptions): string {
  const normas = NORMAS_PROGRAMACION_BLOQUE;
  let body: string;
  switch (role) {
    case "cirujano":
      body = CUERPO_CIRUJANO_BASE.replace("[NORMAS]", normas);
      break;
    case "anestesista":
      body = CUERPO_ANESTESISTA;
      break;
    case "gestor":
    case "gestor-anestesista":
      body = CUERPO_GESTOR
        .replace("[Nombre]", options?.recipientName?.trim() || "Estimado/a")
        .replace("[ENLACE DE ACCESO]", options?.accessLink?.trim() || "[ENLACE DE ACCESO]");
      break;
    case "endoscopista":
      body = CUERPO_ENDOSCOPISTA.replace("[NORMAS]", normas);
      break;
  }
  if (options?.accessLink || options?.initialPassword) {
    body += buildAccessAndSecuritySuffix(options);
  }
  return body;
}

/** Genera enlace mailto: con asunto y cuerpo codificados (para abrir cliente de correo). */
export function buildMailtoLink(toEmail: string, subject: string, body: string): string {
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(body);
  return `mailto:${encodeURIComponent(toEmail)}?subject=${encodedSubject}&body=${encodedBody}`;
}

// --- Recordatorio miércoles: huecos reservados sin pacientes ---
const ASUNTO_RECORDATORIO = "Recordatorio de programación de quirófano – huecos pendientes";

const CUERPO_RECORDATORIO = (apellido: string) => `Estimado/a Dr./Dra. ${apellido},

Le enviamos este mensaje como recordatorio de que actualmente tiene huecos de quirófano reservados para la próxima semana que aún no cuentan con pacientes programados.

Le agradeceríamos, si es posible, que revise la programación en la aplicación del bloque quirúrgico y complete la planificación de los casos previstos.

Tal y como se ha establecido en la organización del bloque, cada jueves a las 00:00 (12:00 AM) se cierra la posibilidad de reservar para la semana siguiente. Los huecos que no estén completos o no tengan pacientes asignados se liberarán automáticamente el jueves a las 00:00, quedando disponibles para otros profesionales.

El objetivo de este sistema es mejorar la previsibilidad y aprovechar al máximo la disponibilidad de quirófanos, facilitando la coordinación entre los equipos quirúrgicos, anestesia y hospitalización.

Si finalmente no tiene previsto utilizar esos huecos, no es necesario realizar ninguna acción, ya que el sistema los liberará automáticamente tras el cierre de la programación.

Muchas gracias por su colaboración.

Un cordial saludo,
Coordinación del Bloque Quirúrgico
Hospital Covadonga – Grupo Ribera`;

export function getRecordatorioMiercolesSubject(): string {
  return ASUNTO_RECORDATORIO;
}

export function getRecordatorioMiercolesBody(apellido: string): string {
  return CUERPO_RECORDATORIO(apellido);
}

/** Apellido del usuario (última palabra del nombre, ej. "Dra. María García" → "García") */
export function getApellidoFromName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1]! : name || "Dr./Dra.";
}

// --- Paciente no apto en consulta de preanestesia (aviso al cirujano) ---
const ASUNTO_NO_APTO = "Paciente no apto en consulta de preanestesia";

const CUERPO_NO_APTO = (apellido: string) => `Estimado/a Dr./Dra. ${apellido},

Le informamos de que el paciente programado para su intervención ha sido valorado en consulta de preanestesia y, en el momento actual, no ha sido considerado apto para la intervención quirúrgica.

En consecuencia, el caso ha sido retirado temporalmente de la programación quirúrgica hasta que la situación clínica del paciente permita reconsiderar la intervención.

El hueco quirúrgico correspondiente ha quedado liberado en la agenda del bloque y podrá ser utilizado para programar otros pacientes si lo considera oportuno.

Si necesita más información o desea comentar el caso, puede ponerse en contacto con la coordinación del bloque quirúrgico a través de la aplicación en la sección "Contactar al gestor".

Muchas gracias por su colaboración.

Un cordial saludo,
Coordinación del Bloque Quirúrgico
Hospital Covadonga – Grupo Ribera`;

export function getPacienteNoAptoSubject(): string {
  return ASUNTO_NO_APTO;
}

export function getPacienteNoAptoBody(apellido: string): string {
  return CUERPO_NO_APTO(apellido);
}
