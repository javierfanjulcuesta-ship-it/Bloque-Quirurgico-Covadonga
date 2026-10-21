const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export interface AssignmentWeekRange {
  dateFrom: string;
  dateTo: string;
}

export function validateAssignmentWeekRange(
  dateFrom: unknown,
  dateTo: unknown,
): { ok: true; range: AssignmentWeekRange } | { ok: false; error: string } {
  if (typeof dateFrom !== "string" || typeof dateTo !== "string" || !DATE_ONLY.test(dateFrom) || !DATE_ONLY.test(dateTo)) {
    return { ok: false, error: "Indique dateFrom y dateTo de la semana (YYYY-MM-DD)." };
  }
  const start = new Date(`${dateFrom}T00:00:00.000Z`);
  const end = new Date(`${dateTo}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || !start.toISOString().startsWith(dateFrom) || !end.toISOString().startsWith(dateTo)) {
    return { ok: false, error: "La semana indicada no es una fecha real." };
  }
  const diffDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (diffDays < 0 || diffDays > 6) {
    return { ok: false, error: "El reemplazo de anestesistas abarca como máximo una semana." };
  }
  return { ok: true, range: { dateFrom, dateTo } };
}

export function assignmentOutsideRange(date: string, range: AssignmentWeekRange): boolean {
  return date < range.dateFrom || date > range.dateTo;
}
