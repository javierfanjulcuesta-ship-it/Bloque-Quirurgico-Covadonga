/**
 * Pasos que hay que cerrar antes de confirmar una reserva pedida por correo.
 * No guarda pacientes.
 */

export interface ShiftStaffing {
  date: string;
  shift: "morning" | "afternoon";
  nurses: number;
  tcae: number;
}

export interface ChecklistStep {
  id: "nursing" | "material" | "insurance";
  label: string;
  done: boolean;
}

export function buildConfirmationChecklist(input: {
  staffing?: ShiftStaffing | null;
  requiredNurses?: number;
  requiredTcae?: number;
  specialMaterial?: string | null;
  materialReady?: boolean;
  insurance?: string | null;
  insuranceAuthorized?: boolean;
}): { steps: ChecklistStep[]; readyToConfirm: boolean } {
  const requiredNurses = input.requiredNurses ?? 1;
  const requiredTcae = input.requiredTcae ?? 1;
  const staffing = input.staffing;
  const nursingDone = Boolean(
    staffing && staffing.nurses >= requiredNurses && staffing.tcae >= requiredTcae,
  );
  const material = input.specialMaterial?.trim() || null;
  const materialDone = !material || material.toLowerCase() === "ninguno" || input.materialReady === true;
  const insurance = input.insurance?.trim().toUpperCase() || null;
  const insuranceDone = insurance === "SNS" || insurance === "SESPA" || (Boolean(insurance) && input.insuranceAuthorized === true);
  const steps: ChecklistStep[] = [
    {
      id: "nursing",
      label: staffing
        ? `Enfermería ${staffing.nurses}/${requiredNurses} y TCAE ${staffing.tcae}/${requiredTcae}`
        : "Enfermería y TCAE del turno sin asignar",
      done: nursingDone,
    },
    {
      id: "material",
      label: material && material.toLowerCase() !== "ninguno" ? `Material: ${material}` : "Sin material especial",
      done: materialDone,
    },
    {
      id: "insurance",
      label: insurance ? `Seguro ${insurance}` : "Seguro sin indicar",
      done: insuranceDone,
    },
  ];
  return { steps, readyToConfirm: steps.every((step) => step.done) };
}
