/** Etiqueta operativa. No deriva de nombre, historia, teléfono ni email. */
export function caseLabelFromOrder(orderIndex: number): string {
  const index = Number.isFinite(orderIndex) ? Math.max(0, Math.floor(orderIndex)) : 0;
  return `Caso ${index + 1}`;
}

export function displayCaseLabel(patient: {
  caseLabel?: string | null;
  order?: number | null;
  numeroHistoria?: string | null;
}): string {
  const stored = patient.caseLabel?.trim();
  if (stored && /^Caso \d+$/.test(stored)) return stored;
  const history = patient.numeroHistoria?.trim();
  if (history && /^Caso \d+$/.test(history)) return history;
  if (typeof patient.order === "number") return caseLabelFromOrder(patient.order);
  return "Caso 1";
}

/** Quita identificadores antes de mostrar o guardar un paciente en el cliente. */
export function operationalPatient<T extends {
  order?: number;
  caseLabel?: string;
  name?: string;
  numeroHistoria?: string;
  patientEmail?: string;
  patientPhone?: string;
}>(patient: T, index = 0): T & { caseLabel: string; numeroHistoria: string } {
  const caseLabel = caseLabelFromOrder(patient.order ?? index);
  return {
    ...patient,
    caseLabel,
    numeroHistoria: caseLabel,
    name: undefined,
    patientEmail: undefined,
    patientPhone: undefined,
  };
}
