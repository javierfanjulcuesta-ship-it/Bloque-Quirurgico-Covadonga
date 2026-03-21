"use client";

/**
 * Vista anestesista: pacientes programados esta semana (asignados a consulta de preanestesia).
 * Permite marcar como "no apto" y abre el cliente de correo para notificar al cirujano.
 */

import { useState, useMemo } from "react";
import { getWeekStart, getWeekDays, toISODate } from "@/lib/utils";
import { getUsers } from "@/lib/dataHelpers";
import { getProfile } from "@/lib/storagePerfiles";
import { addNoApto, isPacienteNoApto, getStoredReservations } from "@/lib/storageMensajesYNotificaciones";
import {
  getPacienteNoAptoSubject,
  getPacienteNoAptoBody,
  getApellidoFromName,
  buildMailtoLink,
} from "@/lib/emailsNuevoUsuario";
import { WeekNavigation } from "@/components/calendar/WeekNavigation";
import { RESOURCES } from "@/lib/constants";
import type { Reservation, PatientInBlock } from "@/lib/types";

interface ValoracionPreanestesiaProps {
  reservations?: Reservation[];
}

type PatientRow = {
  reservation: Reservation;
  patient: PatientInBlock;
  dateStr: string;
  resourceLabel: string;
  surgeonName: string;
  surgeonEmail: string | null;
  alreadyNoApto: boolean;
};

export function ValoracionPreanestesia({ reservations: propReservations }: ValoracionPreanestesiaProps) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [noAptoDone, setNoAptoDone] = useState<string | null>(null);
  const [noAptoVersion, setNoAptoVersion] = useState(0);

  const reservations = useMemo(
    () => propReservations ?? getStoredReservations(),
    [propReservations]
  );

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const from = toISODate(weekDays[0]!);
  const to = toISODate(weekDays[weekDays.length - 1]!);

  const patientsInWeek = useMemo((): PatientRow[] => {
    const list: PatientRow[] = [];
    const users = getUsers();
    reservations.forEach((r) => {
      if (r.date < from || r.date > to || !r.patients?.length) return;
      const surgeon = users.find((u) => u.id === r.surgeonId);
      const surgeonName = surgeon?.name ?? "Cirujano";
      const surgeonEmail =
        (getProfile(r.surgeonId)?.email?.trim() || surgeon?.email?.trim()) || null;
      const resourceLabel = RESOURCES.find((res) => res.id === r.resourceId)?.label ?? r.resourceId;
      r.patients.forEach((p) => {
        list.push({
          reservation: r,
          patient: p,
          dateStr: r.date,
          resourceLabel,
          surgeonName,
          surgeonEmail: surgeonEmail || null,
          alreadyNoApto: isPacienteNoApto(r.id, p.id),
        });
      });
    });
    return list.sort((a, b) => a.dateStr.localeCompare(b.dateStr) || a.patient.order - b.patient.order);
  }, [reservations, from, to, noAptoVersion]);

  const handleMarcarNoApto = (row: PatientRow) => {
    addNoApto(row.reservation.id, row.patient.id);
    setNoAptoVersion((v) => v + 1);
    setNoAptoDone(`${row.reservation.id}-${row.patient.id}`);
    const subject = getPacienteNoAptoSubject();
    const body = getPacienteNoAptoBody(getApellidoFromName(row.surgeonName));
    if (row.surgeonEmail) {
      const mailto = buildMailtoLink(row.surgeonEmail, subject, body);
      window.open(mailto, "_blank");
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-2 text-xl font-bold text-[var(--ribera-navy)]">Valoración consulta de preanestesia</h2>
      <p className="mb-4 text-sm text-gray-600">
        Los pacientes programados esta semana se asignan automáticamente a la consulta (lunes y jueves, mañana). Puede marcar como &quot;no apto&quot; a un paciente; se abrirá el correo para notificar al cirujano que lo programó.
      </p>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50/50 px-4 py-3">
        <span className="font-medium text-sky-900">Semana</span>
        <WeekNavigation weekStart={weekStart} onWeekChange={setWeekStart} canGoNext={true} />
      </div>

      {patientsInWeek.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-8 text-center text-gray-500">
          No hay pacientes programados esta semana. Cuando los cirujanos programen pacientes, podrá valorarlos aquí.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-100">
                <th className="p-2 font-semibold text-gray-700">Fecha</th>
                <th className="p-2 font-semibold text-gray-700">Recurso</th>
                <th className="p-2 font-semibold text-gray-700">Paciente / Nº historia</th>
                <th className="p-2 font-semibold text-gray-700">Procedimiento</th>
                <th className="p-2 font-semibold text-gray-700">Cirujano</th>
                <th className="p-2 font-semibold text-gray-700">Estado</th>
              </tr>
            </thead>
            <tbody>
              {patientsInWeek.map((row) => (
                <tr key={`${row.reservation.id}-${row.patient.id}`} className="border-b border-gray-100 hover:bg-gray-50/80">
                  <td className="p-2 text-gray-800">
                    {new Date(row.dateStr + "T12:00:00").toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}
                  </td>
                  <td className="p-2 text-gray-800">{row.resourceLabel}</td>
                  <td className="p-2">
                    <span className="font-medium text-gray-800">{row.patient.name || "—"}</span>
                    <span className="ml-1 text-gray-500">{row.patient.numeroHistoria}</span>
                  </td>
                  <td className="p-2 text-gray-700">{row.patient.procedure}</td>
                  <td className="p-2 text-gray-700">{row.surgeonName}</td>
                  <td className="p-2">
                    {row.alreadyNoApto ? (
                      <span className="inline-flex items-center rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        No apto
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleMarcarNoApto(row)}
                        className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                      >
                        Marcar no apto
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {noAptoDone && (
        <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
          Se ha registrado como no apto y se ha abierto el correo para notificar al cirujano. Complete el envío desde su cliente de correo.
        </p>
      )}
    </section>
  );
}
