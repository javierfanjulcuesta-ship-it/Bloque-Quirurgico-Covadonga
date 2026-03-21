"use client";

/**
 * Modal para añadir pacientes a una reserva. Valida que el tiempo total (procedimiento + 10 min por paciente) no exceda el tiempo reservado.
 */

import { useState, useMemo } from "react";
import type { PatientInBlock, AdmissionType, SolicitudRecursosId } from "@/lib/types";
import { TRANSITION_MINUTES_PER_PROCEDURE, SOLICITUD_RECURSOS_OPTIONS } from "@/lib/constants";
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

export interface ProgramarPacientesModalProps {
  slots: SlotSelection[];
  /** ID del usuario actual (cirujano/endoscopista) para excluirlo de la lista de 2º cirujano */
  currentUserId?: string;
  onSave: (patients: Omit<PatientInBlock, "id" | "order">[], coSurgeonIds?: string[]) => void | Promise<void>;
  onClose: () => void;
  /** Si true, deshabilita el botón guardar (ej. mientras se guarda en API) */
  saving?: boolean;
}

const ANESTHESIA_OPTIONS = ["Local", "Regional", "General", "Sedación"];

type ModalTab = "datos" | "recursos";

export function ProgramarPacientesModal({ slots, currentUserId, onSave, onClose, saving = false }: ProgramarPacientesModalProps) {
  const [patients, setPatients] = useState<Partial<PatientInBlock>[]>([{}]);
  const [activeTab, setActiveTab] = useState<ModalTab>("datos");
  const [secondSurgeonName, setSecondSurgeonName] = useState("");
  const [error, setError] = useState("");
  const totalReserved = totalReservedMinutes(slots);

  const otherSurgeons = useMemo(
    () =>
      getUsers().filter(
        (u) =>
          (u.role === "cirujano" || u.role === "endoscopista" || u.role === "gestor-anestesista") &&
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
  const updateSolicitudRecursos = (index: number, value: SolicitudRecursosId) => {
    setPatients((prev) => prev.map((p, i) => (i === index ? { ...p, solicitudRecursos: value } : p)));
  };

  const safeMinutes = (p: Partial<PatientInBlock>) =>
    typeof p.estimatedDurationMinutes === "number" && Number.isFinite(p.estimatedDurationMinutes) && p.estimatedDurationMinutes >= 0
      ? p.estimatedDurationMinutes
      : 0;
  const currentTotal = patients.reduce(
    (sum, p) => sum + safeMinutes(p) + TRANSITION_MINUTES_PER_PROCEDURE,
    0
  );
  const over = currentTotal > totalReserved;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const valid = patients.filter(
      (p) =>
        p.numeroHistoria?.trim() &&
        p.procedure?.trim() &&
        p.entidadFinanciadora?.trim() &&
        p.anesthesiaType?.trim() &&
        typeof p.estimatedDurationMinutes === "number" &&
        Number.isFinite(p.estimatedDurationMinutes) &&
        p.estimatedDurationMinutes > 0 &&
        p.solicitudRecursos
    );
    if (valid.length === 0) {
      setError("Rellene al menos un paciente con todos los campos obligatorios (incluida la pestaña Solicitud de recursos).");
      return;
    }
    const total = valid.reduce((s, p) => s + safeMinutes(p) + TRANSITION_MINUTES_PER_PROCEDURE, 0);
    if (total > totalReserved) {
      setError("El tiempo total supera el reservado. Reduzca pacientes o tiempos.");
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
      solicitudRecursos: p.solicitudRecursos!,
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
        setError("No hay ningún cirujano o endoscopista con ese nombre. Deje el campo vacío o compruebe el nombre.");
        return;
      }
      coSurgeonIds = [match.id];
    }

    try {
      await onSave(withOrder, coSurgeonIds);
      onClose();
    } catch {
      setError("Error al guardar. Compruebe que el hueco sigue libre e intente de nuevo.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-2 text-xl font-bold text-[var(--ribera-navy)]">Reservar y programar pacientes</h2>
        <p className="mb-4 text-sm text-gray-600">
          Tiempo reservado total: <strong>{totalReserved} min</strong>. Cada procedimiento suma su tiempo estimado + {TRANSITION_MINUTES_PER_PROCEDURE} min de limpieza/anestesia.
        </p>
        <div className="mb-4 flex gap-2 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setActiveTab("datos")}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium ${activeTab === "datos" ? "border border-b-0 border-gray-200 bg-white text-[var(--ribera-navy)]" : "text-gray-600 hover:bg-gray-50"}`}
          >
            Datos del paciente
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("recursos")}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium ${activeTab === "recursos" ? "border border-b-0 border-gray-200 bg-white text-[var(--ribera-navy)]" : "text-gray-600 hover:bg-gray-50"}`}
          >
            Solicitud de recursos
          </button>
        </div>
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
          {activeTab === "datos" && (
          <>
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
                    onChange={(e) => {
                  const raw = e.target.value;
                  const n = parseInt(raw, 10);
                  const val = raw !== "" && !Number.isNaN(n) && n >= 0 ? n : 0;
                  updatePatient(index, "estimatedDurationMinutes", val);
                }}
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
          </>
          )}
          {activeTab === "recursos" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Seleccione la solicitud de recursos para cada paciente.</p>
            {patients.map((p, index) => (
              <fieldset key={index} className="rounded-lg border border-gray-200 p-4">
                <div className="mb-2 font-medium text-gray-700">Paciente {index + 1}{p.procedure?.trim() ? ` · ${p.procedure}` : ""}</div>
                <label>
                  <span className="block text-sm font-medium text-gray-700">Solicitud de recursos *</span>
                  <select
                    value={p.solicitudRecursos ?? ""}
                    onChange={(e) => updateSolicitudRecursos(index, e.target.value as SolicitudRecursosId)}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    required
                  >
                    <option value="">Seleccione</option>
                    {SOLICITUD_RECURSOS_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                </label>
              </fieldset>
            ))}
          </div>
          )}
          {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" className="btn-ribera-primary" disabled={over || saving}>
              {saving ? "Guardando…" : "Guardar y programar"}
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
