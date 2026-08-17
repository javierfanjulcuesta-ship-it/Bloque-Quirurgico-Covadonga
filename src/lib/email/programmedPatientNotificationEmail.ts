export interface ProgrammedPatientNotificationInput {
  patient: {
    fullName?: string | null;
    historyNumber: string;
    procedure: string;
    estimatedDurationMinutes: number;
    anesthesiaType: string;
    insuranceType: string;
    admissionType?: string | null;
    solicitudRecursos?: string | null;
    notes?: string | null;
    patientEmail?: string | null;
    patientPhone?: string | null;
  };
  surgery: {
    date: string;
    startTime: string;
    endTime: string;
    resourceLabel: string;
    shiftLabel: string;
    responsibleProfessionalName: string;
  };
  preanesthesia: {
    status: string;
    appointmentLabel?: string | null;
  };
}

export interface ProgrammedPatientNotificationEmail {
  subject: string;
  text: string;
}

function line(label: string, value: string | number | null | undefined): string {
  const normalized = value === null || value === undefined || value === "" ? "No consta" : String(value);
  return `${label}: ${normalized}`;
}

/**
 * Construye el contenido clínico-operativo destinado al buzón configurable por gestión.
 * No acepta IDs técnicos, credenciales ni metadatos de auditoría, para que esos datos no
 * puedan colarse accidentalmente en el correo aunque cambie el llamador.
 */
export function buildProgrammedPatientNotificationEmail(
  input: ProgrammedPatientNotificationInput,
): ProgrammedPatientNotificationEmail {
  const patientLabel = input.patient.fullName?.trim() || "Paciente programado";
  const preanesthesiaLabel = input.preanesthesia.appointmentLabel?.trim()
    || (input.preanesthesia.status === "SCHEDULED" ? "Cita asignada (hora no disponible)" : "Pendiente de asignación");

  const subject = `QxFlow · Paciente programado · ${input.surgery.date} · ${input.surgery.resourceLabel}`;
  const text = [
    "Se ha programado un paciente en QxFlow.",
    "",
    "PACIENTE",
    line("Nombre", patientLabel),
    line("NHC", input.patient.historyNumber),
    line("Procedimiento", input.patient.procedure),
    line("Duración estimada", `${input.patient.estimatedDurationMinutes} min`),
    line("Tipo de anestesia", input.patient.anesthesiaType),
    line("Entidad financiadora", input.patient.insuranceType),
    line("Tipo de ingreso", input.patient.admissionType),
    line("Recursos solicitados", input.patient.solicitudRecursos),
    line("Notas", input.patient.notes),
    line("Email paciente", input.patient.patientEmail),
    line("Teléfono paciente", input.patient.patientPhone),
    "",
    "PROGRAMACIÓN QUIRÚRGICA",
    line("Fecha", input.surgery.date),
    line("Horario", `${input.surgery.startTime}-${input.surgery.endTime}`),
    line("Sala", input.surgery.resourceLabel),
    line("Turno", input.surgery.shiftLabel),
    line("Cirujano/endoscopista responsable", input.surgery.responsibleProfessionalName),
    "",
    "PREANESTESIA",
    line("Estado", input.preanesthesia.status),
    line("Cita", preanesthesiaLabel),
  ].join("\n");

  return { subject, text };
}
