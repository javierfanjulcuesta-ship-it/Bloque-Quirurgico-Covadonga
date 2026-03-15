"use client";

/**
 * Modal para añadir pacientes a una reserva. Valida que el tiempo total (procedimiento + 10 min por paciente) no exceda el tiempo reservado.
 */

import { useState, useMemo } from "react";
import type { PatientInBlock, AdmissionType } from "@/lib/types";
import { TRANSITION_MINUTES_PER_PROCEDURE } from "@/lib/constants";
import type { Shift } from "@/lib/types";
import { getUsers } from "@/lib/dataHelpers";

export interface SlotSelection {
  date: string;
  resourceId: string;
  shift: Shift;
  slotIndex: number;
  durationMinutes: number;
}

function totalReservedMinutes(slots: SlotSelection[]): number {
  return slots.reduce((sum, s) => sum + s.durationMinutes, 0);
}

function patientTotalMinutes(p: { estimatedDurationMinutes: number }): number {
  return p.estimatedDurationMinutes + TRANSITION_MINUTES_PER_PROCEDURE;
}

export interface ProgramarPacientesModalProps {
  slots: SlotSelection[];
  /** ID del usuario actual (cirujano/endoscopista) para excluirlo de la lista de 2º cirujano */
  currentUserId?: string;
  onSave: (patients: Omit<PatientInBlock, "id" | "order">[], coSurgeonIds?: string[]) => void;
  onClose: () => void;
}

const ANESTHESIA_OPTIONS = ["Local", "Regional", "General", "Sedación"];

export function ProgramarPacientesModal({ slots, currentUserId, onSave, onClose }: ProgramarPacientesModalProps) {
  const [patients, setPatients] = useState<Partial<PatientInBlock>[]>([{}]);
  const [secondSurgeonName, setSecondSurgeonName] = useState("");
  const [error, setError] = useState("");
  const totalReserved = totalReservedMinutes(slots);

  const otherSurgeons = useMemo(
    () =>
      getUsers().filter(
        (u) =>
          (u.role === "cirujano" || u.role === "endoscopista") &&
          u.id !== currentUserId &&
          u.approved
      ),
    [currentUserId]
  );

  const addPatient = () => setPatients((prev) => [...prev, {}]);
  const removePatient = (index: number) => setPatients((prev) => prev.filter((_, i) => i !== index));
  const updatePatient = (index: number, field: keyof PatientInBlock, value: string | number) => {
    setPatients((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  };

  const currentTotal = patients.reduce(
    (sum, p) => sum + (p.estimatedDurationMinutes ?? 0) + TRANSITION_MINUTES_PER_PROCEDURE,
    0
  );
  const over = currentTotal > totalReserved;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const valid = patients.filter(
      (p) =>
        p.numeroHistoria?.trim() &&
        p.procedure?.trim() &&
        p.entidadFinanciadora?.trim() &&
        p.anesthesiaType?.trim() &&
        typeof p.estimatedDurationMinutes === "number" &&
        p.estimatedDurationMinutes > 0
    );
    if (valid.length === 0) {
      setError("Rellene al menos un paciente con todos los campos obligatorios.");
      return;
    }
    const total = valid.reduce((s, p) => s + (p.estimatedDurationMinutes ?? 0) + TRANSITION_MINUTES_PER_PROCEDURE, 0);
    if (total > totalReserved) {
      setError(
        `El tiempo total de los procedimientos (${total} min) supera el tiempo reservado (${totalReserved} min). Reduzca el número de pacientes o los tiempos estimados.`
      );
      return;
    }
    const withOrder: Omit<PatientInBlock, "id" | "order">[] = valid.map((p, i) => ({
      name: p.name,
      numeroHistoria: p.numeroHistoria!.trim(),
      procedure: p.procedure!.trim(),
      estimatedDurationMinutes: p.estimatedDurationMinutes!,
      anesthesiaType: p.anesthesiaType!.trim(),
      entidadFinanciadora: p.entidadFinanciadora!.trim(),
      admissionType: (p.admissionType as AdmissionType) ?? "ambulatorio",
      notes: p.notes?.trim() ?? "",
      order: i,
    }));

    let coSurgeonIds: string[] | undefined;
    const nameTrim = secondSurgeonName.trim();
    if (nameTrim) {
      const inputLower = nameTrim.toLowerCase();
      const match = otherSurgeons.find(
        (u) =>
          u.name.toLowerCase() === inputLower ||
          u.name.toLowerCase().includes(inputLower) ||
          inputLower.includes(u.name.toLowerCase())
      );
      if (!match) {
        setError("No se encontró ningún cirujano o endoscopista con ese nombre. Deje el campo vacío o compruebe el nombre.");
        return;
      }
      coSurgeonIds = [match.id];
    }

    onSave(withOrder, coSurgeonIds);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-2 text-xl font-bold text-[var(--ribera-navy)]">Reservar y programar pacientes</h2>
        <p className="mb-4 text-sm text-gray-600">
          Tiempo reservado total: <strong>{totalReserved} min</strong>. Cada procedimiento suma su tiempo estimado + {TRANSITION_MINUTES_PER_PROCEDURE} min de limpieza/anestesia.
        </p>
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <label className="block">
            <span className="block text-sm font-medium text-gray-700">2º cirujano (opcional)</span>
            <input
              type="text"
              value={secondSurgeonName}
              onChange={(e) => setSecondSurgeonName(e.target.value)}
              placeholder="Nombre del otro cirujano o endoscopista"
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              list="second-surgeon-list"
            />
            <datalist id="second-surgeon-list">
              {otherSurgeons.map((u) => (
                <option key={u.id} value={u.name} />
              ))}
            </datalist>
          </label>
        </div>
        {over && (
          <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-800">
            El tiempo total introducido ({currentTotal} min) supera el reservado ({totalReserved} min). Debe reducir pacientes o tiempos.
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          {patients.map((p, index) => (
            <fieldset key={index} className="rounded-lg border border-gray-200 p-4">
              <div className="mb-2 flex justify-between">
                <span className="font-medium text-gray-700">Paciente {index + 1}</span>
                {patients.length > 1 && (
                  <button type="button" onClick={() => removePatient(index)} className="text-sm text-red-600 hover:underline">
                    Quitar
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="block text-sm font-medium text-gray-700">Nº historia clínica *</span>
                  <input
                    type="text"
                    value={p.numeroHistoria ?? ""}
                    onChange={(e) => updatePatient(index, "numeroHistoria", e.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    required
                  />
                </label>
                <label>
                  <span className="block text-sm font-medium text-gray-700">Entidad gestora *</span>
                  <input
                    type="text"
                    value={p.entidadFinanciadora ?? ""}
                    onChange={(e) => updatePatient(index, "entidadFinanciadora", e.target.value)}
                    placeholder="Ej. Mutua, Privado, SAS..."
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    required
                  />
                </label>
                <label className="sm:col-span-2">
                  <span className="block text-sm font-medium text-gray-700">Procedimiento *</span>
                  <input
                    type="text"
                    value={p.procedure ?? ""}
                    onChange={(e) => updatePatient(index, "procedure", e.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    required
                  />
                </label>
                <label>
                  <span className="block text-sm font-medium text-gray-700">Ingreso o ambulatorio *</span>
                  <select
                    value={p.admissionType ?? "ambulatorio"}
                    onChange={(e) => updatePatient(index, "admissionType", e.target.value as AdmissionType)}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="ambulatorio">Ambulatorio</option>
                    <option value="ingreso">Ingreso</option>
                  </select>
                </label>
                <label>
                  <span className="block text-sm font-medium text-gray-700">Tipo de anestesia *</span>
                  <select
                    value={p.anesthesiaType ?? ""}
                    onChange={(e) => updatePatient(index, "anesthesiaType", e.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    required
                  >
                    <option value="">Seleccione</option>
                    {ANESTHESIA_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="block text-sm font-medium text-gray-700">Tiempo estimado (min) *</span>
                  <input
                    type="number"
                    min={1}
                    value={p.estimatedDurationMinutes ?? ""}
                    onChange={(e) => updatePatient(index, "estimatedDurationMinutes", e.target.value ? parseInt(e.target.value, 10) : 0)}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    required
                  />
                </label>
                <label className="sm:col-span-2">
                  <span className="block text-sm font-medium text-gray-700">Notas</span>
                  <input
                    type="text"
                    value={p.notes ?? ""}
                    onChange={(e) => updatePatient(index, "notes", e.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>
            </fieldset>
          ))}
          <button type="button" onClick={addPatient} className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            + Añadir otro paciente
          </button>
          {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" className="btn-ribera-primary" disabled={over}>
              Guardar y programar
            </button>
            <button type="button" onClick={onClose} className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
