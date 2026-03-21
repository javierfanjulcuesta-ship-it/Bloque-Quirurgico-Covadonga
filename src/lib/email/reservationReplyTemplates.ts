/**
 * Plantillas de respuesta automática a correos de reserva.
 * Remitente: jfanjul@riberacare.com (Coordinación Bloque Quirúrgico)
 */

export type ReplyCase =
  | "reservation_created"
  | "format_not_recognized"
  | "sender_not_registered"
  | "role_not_authorized"
  | "slot_occupied";

export interface ReplyContent {
  subject: string;
  body: string;
}

const BASE_SIGNATURE = `

Un cordial saludo,
Coordinación del Bloque Quirúrgico
Hospital Covadonga – Grupo Ribera`;

export function getReservationReplyContent(
  caseType: ReplyCase,
  options?: {
    reservationId?: string;
    date?: string;
    resourceId?: string;
    errorDetail?: string;
  }
): ReplyContent {
  switch (caseType) {
    case "reservation_created":
      return {
        subject: "Re: Reserva confirmada – Bloque Quirúrgico",
        body: `Estimado/a,

Su solicitud de reserva ha sido procesada correctamente.

${options?.date && options?.resourceId ? `Fecha: ${options.date}\nRecurso: ${options.resourceId}\n` : ""}${options?.reservationId ? `Referencia: ${options.reservationId}\n` : ""}

Puede consultar la programación en la aplicación del bloque quirúrgico y completar los datos de los pacientes si aún no lo ha hecho.
${BASE_SIGNATURE}`,
      };

    case "format_not_recognized":
      return {
        subject: "Re: Reserva – Bloque Quirúrgico (formato no reconocible)",
        body: `Estimado/a,

Hemos recibido su correo de solicitud de reserva, pero no hemos podido interpretar correctamente el formato.

Para reservar por correo, incluya de forma clara:
- Fecha (ej. 2025-03-25 o 25/03/2025)
- Quirófano o recurso (Q1, Q2, Q3, procedimientos menores o técnicas del dolor)
- Turno (mañana o tarde)
- Slot o tramo (0, 1, 2...)
- Opcionalmente: lista de pacientes con nº historia, procedimiento y duración en minutos

${options?.errorDetail ? `Detalle: ${options.errorDetail}\n` : ""}Si lo prefiere, puede realizar la reserva directamente desde la aplicación del bloque quirúrgico.
${BASE_SIGNATURE}`,
      };

    case "sender_not_registered":
      return {
        subject: "Re: Reserva – Bloque Quirúrgico (remitente no registrado)",
        body: `Estimado/a,

Hemos recibido su correo de solicitud de reserva, pero la dirección desde la que envía no está registrada como usuario de la aplicación del bloque quirúrgico.

Para poder reservar por correo, debe ser un usuario registrado con perfil de cirujano o endoscopista. Si aún no tiene acceso, póngase en contacto con la coordinación para solicitar el alta.
${BASE_SIGNATURE}`,
      };

    case "role_not_authorized":
      return {
        subject: "Re: Reserva – Bloque Quirúrgico (permiso no autorizado)",
        body: `Estimado/a,

Solo los usuarios con perfil de cirujano o endoscopista pueden crear reservas por correo.

Si necesita realizar una reserva, póngase en contacto con la coordinación o utilice la aplicación si tiene el perfil adecuado.
${BASE_SIGNATURE}`,
      };

    case "slot_occupied":
      return {
        subject: "Re: Reserva – Bloque Quirúrgico (hueco ocupado)",
        body: `Estimado/a,

Lamentamos informarle de que el hueco solicitado ya está ocupado por otro profesional.

${options?.date && options?.resourceId ? `Fecha: ${options.date}\nRecurso: ${options.resourceId}\n` : ""}Le rogamos que consulte la disponibilidad en la aplicación del bloque quirúrgico y seleccione otro hueco disponible.
${BASE_SIGNATURE}`,
      };
  }
}
