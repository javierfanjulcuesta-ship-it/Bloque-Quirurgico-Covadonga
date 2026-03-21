/**
 * Plantilla de correo para notificar a cirujanos sobre huecos liberados a la bolsa común.
 * Solo incluye: fecha, turno, recurso. Sin datos sensibles.
 */

export interface ReleasedSlotInfo {
  date: string; // YYYY-MM-DD
  shift: string; // "morning" | "afternoon"
  resourceId: string;
}

const LABELS: Record<string, string> = {
  morning: "Mañana",
  afternoon: "Tarde",
  MORNING: "Mañana",
  AFTERNOON: "Tarde",
  "procedimientos-menores": "Procedimientos menores",
  "tecnicas-dolor": "Técnicas del dolor",
};

function formatDate(isoDate: string): string {
  try {
    const d = new Date(isoDate + "T12:00:00");
    return d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  } catch {
    return isoDate;
  }
}

function formatShift(shift: string): string {
  return LABELS[shift] ?? shift;
}

function formatResource(resourceId: string): string {
  return LABELS[resourceId] ?? resourceId;
}

export function buildReleaseNotificationEmail(slots: ReleasedSlotInfo[]): { subject: string; text: string } {
  if (slots.length === 0) {
    return {
      subject: "Nuevos huecos disponibles – Bloque Quirúrgico",
      text: "No hay huecos nuevos liberados.",
    };
  }

  const subject =
    slots.length === 1
      ? `Hueco disponible – Bloque Quirúrgico ${formatDate(slots[0]!.date)}`
      : `${slots.length} huecos disponibles – Bloque Quirúrgico`;

  const lines = slots.map((s) => {
    const date = formatDate(s.date);
    const shift = formatShift(s.shift === "MORNING" ? "MORNING" : s.shift === "AFTERNOON" ? "AFTERNOON" : s.shift);
    const resource = formatResource(s.resourceId);
    return `• ${date} – ${shift} – ${resource}`;
  });

  const text = `Estimado/a Dr./Dra.,

Se han liberado huecos de quirófano a la bolsa común tras el cierre de programación del jueves. Estos huecos están ahora disponibles para reservar:

${lines.join("\n")}

Puede consultar la programación y reservar en la aplicación del bloque quirúrgico.

Un cordial saludo,
Coordinación del Bloque Quirúrgico
Hospital Covadonga – Grupo Ribera`;

  return { subject, text };
}
