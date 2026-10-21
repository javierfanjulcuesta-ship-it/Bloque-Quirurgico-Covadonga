/**
 * Correos mock para probar clasificación y parser localmente.
 * Usar en desarrollo sin depender del buzón real.
 */

import type { InboxMessage } from "./types";

export const MOCK_RESERVATION_EMAIL: InboxMessage = {
  id: "mock-res-1",
  fromEmail: "cirujano@hospital.com",
  fromName: "Cirujano Demo",
  subject: "Reserva quirófano Q1",
  bodyPlain: `Buenos días,

Solicito reservar el siguiente hueco:

Fecha: 2025-03-20
Quirófano: Q1
Turno: Mañana
Slot: 0

Pacientes:
- TEST-0001: Paciente Prueba 01, Procedimiento de prueba, 60 min
- TEST-0002: Paciente Prueba 02, Procedimiento de prueba, 45 min

Gracias.`,
  receivedAt: new Date().toISOString(),
};

export const MOCK_GENERAL_EMAIL: InboxMessage = {
  id: "mock-gen-1",
  fromEmail: "consulta@hospital.com",
  fromName: "Coordinación Demo",
  subject: "Consulta sobre coordinación",
  bodyPlain: `Hola,

Tengo una duda sobre el cambio de fecha de una intervención programada.
¿Podemos hablar esta semana?

Gracias.`,
  receivedAt: new Date().toISOString(),
};

export const MOCK_ACCESS_REQUEST_EMAIL: InboxMessage = {
  id: "mock-acc-1",
  fromEmail: "nuevo@hospital.com",
  fromName: "Usuario Prueba",
  subject: "Solicitud de acceso al sistema",
  bodyPlain: `Estimados,

Necesito dar de alta un nuevo usuario en la aplicación del bloque quirúrgico.
¿Me pueden indicar el proceso para solicitar acceso y contraseña inicial?

Saludos.`,
  receivedAt: new Date().toISOString(),
};

export const MOCK_INBOX: InboxMessage[] = [
  MOCK_RESERVATION_EMAIL,
  MOCK_GENERAL_EMAIL,
  MOCK_ACCESS_REQUEST_EMAIL,
];
