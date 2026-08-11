"use client";

/**
 * Vista anestesista: pacientes programados esta semana (asignados a consulta de preanestesia).
 * En modo real, "no apto" se persiste en PatientInBlock.preanesthesiaStatus.
 * localStorage se mantiene únicamente para el modo demo.
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
import { modoDemo } from "@/lib/config";
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

async function persistNoApto(patientId: string): Promise<void> {
  const response = await fetch(`/api/preanesthesia/patients/${encodeURIComponent(patientId)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ status: "NOT_FIT" }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((payload as { error?: string }).error ?? "No se pudo guardar la valoración");
  }
}

export function ValoracionPreanestesia({ reservations: propReservations }: ValoracionPreanestesiaProps) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [noAptoDone, setNoAptoDone] = useState<string | null>(null);
  const [locallyMarked, setLocallyMarked] = useState<Set<string>>(new Set());
  const [savingPatientId, setSavingPatientId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

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
        const key = `${r.id}-${p.id}`;
        const persistedNoApto = modoDemo
          ? isPacienteNoApto(r.id, p.id)
          : p.preanesthesiaStatus === "NOT_FIT";
        list.push({
          reservation: r,
          patient: p,
          dateStr: r.date,
          resourceLabel,
          surgeonName,
          surgeonEmail: surgeonEmail || null,
          alreadyNoApto: persistedNoApto || locallyMarked.has(key),
        });
      });
    });
    return list.sort((a, b) => a.dateStr.localeCompare(b.dateStr) || a.patient.order - b.patient.order);
  }, [reservations, from, to, locallyMarked]);

  const handleMarcarNoApto = async (row: PatientRow) => {
    const key = `${row.reservation.id}-${row.patient.id}`;
    setSavingPatientId(row.patient.id);
    setSaveError(null);
    try {
      if (modoDemo) {
        addNoApto(row.reservation.id, row.patient.id);
      } else {
        await persistNoApto(row.patient.id);
      }

      setLocallyMarked((current) => {
        const next = new Set(current);
        next.add(key);
        return next;
      });
      setNoAptoDone(key);

      // El correo sigue siendo una acción explícita del cliente; el estado clínico ya quedó
      // persistido antes de abrirlo. No se afirma que el correo se haya enviado.
      const subject = getPacienteNoAptoSubject();
      const body = getPacienteNoAptoBody(getApellidoFromName(row.surgeonName));
      if (row.surgeonEmail) {
        const mailto = buildMailtoLink(row.surgeonEmail, subject, body);
        window.open(mailto, "_blank");
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar la valoración");
    } finally {
      setSavingPatientId(null);
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-2 text-xl font-bold text-[var(--ribera-navy)]">Valoración consulta de preanestesia</h2>
      <p className="mb-4 text-sm text-gray-600">
        Los pacientes programados esta semana se asignan automáticamente a la consulta (lunes y jueves, mañana). Puede marcar como &quot;no apto&quot; a un paciente; la valoración queda registrada y, si hay correo del cirujano, se abrirá un borrador para notificarle.
      </p>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-100 bg-red-50/50 px-4 py-3">
        <span className="font-medium text-gray-900">Semana</span>
        <WeekNavigation weekStart={weekStart} onWeekChange={setWeekStart} canGoNext={true} />
      </div>

      {saveError && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {saveError}
        </p>
      )}

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
                        disabled={savingPatientId === row.patient.id}
                        onClick={() => void handleMarcarNoApto(row)}
                        className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingPatientId === row.patient.id ? "Guardando…" : "Marcar no apto"}
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
          La valoración &quot;no apto&quot; ha quedado registrada. Si se abrió un borrador de correo, complete el envío desde su cliente.
        </p>
      )}
    </section>
  );
}
