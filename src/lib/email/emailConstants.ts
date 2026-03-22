/**
 * Constantes compartidas para plantillas de email.
 */

/** Normas de programación y reserva del bloque (correos cirujano/endoscopista y app). */
export const NORMAS_PROGRAMACION_BLOQUE = `
• Los quirófanos (Q1, Q2, Q3) y las salas de procedimientos menores y técnicas del dolor funcionan en régimen compartido según el perfil de cada profesional: cirujanos pueden reservar en quirófanos y procedimientos menores; endoscopistas, en procedimientos menores y técnicas del dolor.

• Días laborables: solo es posible reservar de lunes a viernes.

• Cierre de la semana siguiente: el jueves de la semana 1 a las 00:00 se cierra la posibilidad de reserva de toda la semana 2. Para la semana 2 solo se puede programar directamente pacientes en los huecos libres (no reservar huecos sin pacientes). El resto de semanas permanecen abiertas hasta un máximo de 4 semanas por delante.

• Los miércoles se envía un recordatorio automático a quienes tengan huecos reservados sin pacientes programados. Los huecos no completos o sin pacientes en el momento del cierre del jueves se liberan automáticamente para otros profesionales.

• Los primeros tramos de la mañana y de la tarde requieren una reserva mínima de 1 hora y 30 minutos.

• En un mismo bloque reservado se pueden incluir varios pacientes, según la duración estimada de los procedimientos. A cada procedimiento se le suman 10 minutos de limpieza, anestesia y colocación.

• Los pacientes programados se asignan automáticamente a la consulta de preanestesia disponible (lunes y jueves por la mañana).

• Contacto con la coordinación: en el perfil de la aplicación está la sección "Contactar al gestor" para enviar un mensaje (asunto y texto). El mensaje queda registrado y, si el gestor tiene correo en el sistema, se abrirá el cliente de correo para enviarlo. Cualquier duda o incidencia puede resolverse así de forma ágil.
`.trim();
