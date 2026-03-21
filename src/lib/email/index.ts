/**
 * Módulo de correo Outlook / Microsoft 365
 */

export {
  sendEmail,
  sendNewUserInvitationEmail,
  sendReplyToReservationEmail,
  sendGeneralReplyEmail,
  sendRecordatorioMiercolesEmail,
  sendPacienteNoAptoEmail,
  fetchInboxMessages,
  classifyIncomingEmailMessage,
  parseReservationEmailFromMessage,
  GESTOR_EMAIL,
  isUsingRealEmail,
} from "./outlookService";

export type {
  InboxMessage,
  EmailClassification,
  ParsedReservationEmail,
} from "./types";

export { classifyIncomingEmail } from "./classifyEmail";
export { parseReservationEmail } from "./parseReservationEmail";
export { createMockOutlookAdapter } from "./outlookAdapter";
export type { OutlookAdapter, SendEmailParams } from "./outlookAdapter";
export { MOCK_INBOX, MOCK_RESERVATION_EMAIL, MOCK_GENERAL_EMAIL, MOCK_ACCESS_REQUEST_EMAIL } from "./mockInbox";
