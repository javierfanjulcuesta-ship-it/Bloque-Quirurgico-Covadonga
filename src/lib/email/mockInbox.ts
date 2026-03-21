/**
 * Correos mock para probar clasificación y parser localmente.
 * Usar en desarrollo sin depender del buzón real.
 */

import type { InboxMessage } from "./types";

export const MOCK_RESERVATION_EMAIL: InboxMessage = {
  id: "mock-res-1",
  fromEmail: "cirujano@hospital.com",
  fromName: "Dr. García",
  subject: "Reserva quirófano Q1",
  bodyPlain: `Buenos días,

Solicito reservar el siguiente hueco:

Fecha: 2025-03-20
Quirófano: Q1
Turno: Mañana
Slot: 0

Pacientes:
- HC-001234: Juan Pérez, Artroscopia rodilla, 60 min
- HC-001235: María López, Meniscectomía, 45 min

Gracias.`,
  receivedAt: new Date().toISOString(),
};

export const MOCK_GENERAL_EMAIL: InboxMessage = {
  id: "mock-gen-1",
  fromEmail: "consulta@hospital.com",
  fromName: "Ana Martínez",
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
  fromName: "Carlos Ruiz",
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
