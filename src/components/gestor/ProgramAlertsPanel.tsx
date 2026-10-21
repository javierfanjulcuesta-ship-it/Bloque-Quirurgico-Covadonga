"use client";

import type { ProgramAlert, ProgramAlertsResult } from "@/lib/program/programAlerts";

function shiftLabel(shift: "morning" | "afternoon"): string {
  return shift === "morning" ? "mañana" : "tarde";
}

function describeAlert(
  alert: ProgramAlert,
  nameOf: (id: string) => string,
): string {
  switch (alert.kind) {
    case "overlap":
      return `${alert.date} ${alert.resourceId} ${shiftLabel(alert.shift)}: ${nameOf(alert.surgeonAId)} y ${nameOf(alert.surgeonBId)} se solapan ${alert.overlapMinutes} min.`;
    case "without_room":
      return `${alert.date ? `${alert.date}: ` : ""}${alert.label}. ${alert.detail ?? "Sin quirófano."}`;
    case "missing_anesthetist":
      return `${alert.date} ${alert.resourceId} ${shiftLabel(alert.shift)}: ${alert.patientCount} paciente(s) sin anestesista de quirófano.`;
    case "too_many_surgeons":
      return `${alert.date} ${shiftLabel(alert.shift)}: ${alert.surgeonCount} cirujanos (más de 3).`;
    case "idle_endoscopy":
      return `${alert.date} ${shiftLabel(alert.shift)}: anestesista en ${alert.resourceId === "endoscopias" ? "Endoscopias" : "menores"} sin pacientes. No se mueve solo.`;
    default:
      return "Alerta de programa.";
  }
}

export function ProgramAlertsPanel({
  result,
  nameOf = (id) => id,
}: {
  result: ProgramAlertsResult;
  nameOf?: (id: string) => string;
}) {
  const overlaps = result.alerts.filter((alert) => alert.kind === "overlap");
  const withoutRoom = result.alerts.filter((alert) => alert.kind === "without_room");
  const missing = result.alerts.filter((alert) => alert.kind === "missing_anesthetist");
  const crowded = result.alerts.filter((alert) => alert.kind === "too_many_surgeons");
  const idle = result.alerts.filter((alert) => alert.kind === "idle_endoscopy");

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4" aria-label="Alertas de programa">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-amber-950">Alertas de programa</h2>
          <p className="text-xs text-amber-900/80">Solo lectura. No reasignan quirófano ni anestesista.</p>
        </div>
        <dl className="flex flex-wrap gap-2 text-sm">
          <div className="rounded-lg border border-amber-200 bg-white px-3 py-1.5">
            <dt className="text-[10px] uppercase tracking-wide text-gray-500">IQ</dt>
            <dd className="font-semibold tabular-nums text-gray-900">{result.counts.iq}</dd>
          </div>
          <div className="rounded-lg border border-amber-200 bg-white px-3 py-1.5">
            <dt className="text-[10px] uppercase tracking-wide text-gray-500">Cirujanos</dt>
            <dd className="font-semibold tabular-nums text-gray-900">{result.counts.surgeons}</dd>
          </div>
          <div className="rounded-lg border border-amber-200 bg-white px-3 py-1.5">
            <dt className="text-[10px] uppercase tracking-wide text-gray-500">Minutos</dt>
            <dd className="font-semibold tabular-nums text-gray-900">{result.counts.minutes}</dd>
          </div>
        </dl>
      </div>
      {result.alerts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-amber-200 bg-white px-3 py-3 text-sm text-gray-600">
          Sin solapes, pacientes sin quirófano, huecos sin anestesista ni turnos con más de 3 cirujanos.
        </p>
      ) : (
        <ul className="space-y-1.5 text-sm text-amber-950">
          {[...overlaps, ...withoutRoom, ...missing, ...crowded, ...idle].map((alert, index) => (
            <li key={`${alert.kind}-${index}`} className="rounded-md bg-white px-3 py-2">
              {describeAlert(alert, nameOf)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
