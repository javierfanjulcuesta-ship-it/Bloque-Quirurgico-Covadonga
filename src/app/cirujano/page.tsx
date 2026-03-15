"use client";

/**
 * Dashboard cirujano: pestaña "Estado actual del bloque quirúrgico" y "Mi perfil".
 * Vista día en columnas, rangos en filas; verde/rojo/amarillo/blanco. Selección múltiple y reservar o programar pacientes.
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getWeekStart, toISODate, getSlotDurationMinutes, isNextWeekReserveClosed } from "@/lib/utils";
import { getStoredReservations, addOrUpdateStoredReservation } from "@/lib/storageMensajesYNotificaciones";
import { getAllowedResourcesForRole } from "@/lib/constants";
import { RESOURCES } from "@/lib/constants";
import { getUsers, buildSlotViews } from "@/lib/dataHelpers";
import { ProgramarPacientesModal, type SlotSelection } from "@/components/cirujano/ProgramarPacientesModal";
import { DaySlotGrid } from "@/components/calendar/DaySlotGrid";
import type { SlotView } from "@/lib/types";
import { MiPerfil } from "@/components/MiPerfil";
import { ContactarCoordinacion } from "@/components/ContactarCoordinacion";
import { HistoricoView } from "@/components/HistoricoView";
import type { Reservation, ResourceId, PatientInBlock } from "@/lib/types";
import type { Shift } from "@/lib/types";
import { WeekGridCalendar } from "@/components/calendar/WeekGridCalendar";

function slotKey(date: string, resourceId: string, shift: string, slotIndex: number) {
  return `${date}__${resourceId}__${shift}__${slotIndex}`;
}

export default function CirujanoPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<"bloque" | "pacientes" | "perfil" | "coordinacion" | "historico">("bloque");
  const [selectedDateForGrid, setSelectedDateForGrid] = useState<Date | null>(null);
  const [calendarPeriodStart, setCalendarPeriodStart] = useState(() => getWeekStart(new Date()));
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [showProgramarModal, setShowProgramarModal] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const refreshReservations = useCallback(() => {
    setReservations(getStoredReservations());
  }, []);

  useEffect(() => {
    refreshReservations();
  }, [refreshReservations]);

  useEffect(() => {
    if (!user) {
      router.replace("/");
      return;
    }
    if (user.role !== "cirujano" && user.role !== "endoscopista") {
      router.replace("/calendario");
    }
  }, [user, router]);

  const allowedResources = useMemo(
    () => (user && (user.role === "cirujano" || user.role === "endoscopista") ? RESOURCES.filter((r) => getAllowedResourcesForRole(user.role).includes(r.id)) : []),
    [user?.role]
  );
  const handleSlotSelect = (slot: SlotView) => {
    const key = slotKey(slot.date, slot.resourceId, slot.shift, slot.slotIndex);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /** SlotViews del día seleccionado (columnas = recursos, filas = rangos horarios) */
  const slotViewsForSelectedDay = useMemo(() => {
    if (!selectedDateForGrid) return [];
    const weekStartForDay = getWeekStart(selectedDateForGrid);
    const allViews = buildSlotViews(weekStartForDay, reservations, {
      currentUserId: user?.id,
      users: getUsers(),
    });
    const dateStr = toISODate(selectedDateForGrid);
    return allViews.filter((v) => v.date === dateStr && allowedResources.some((r) => r.id === v.resourceId));
  }, [selectedDateForGrid, reservations, user?.id, allowedResources]);

  /** Claves seleccionadas en formato DaySlotGrid (resourceId-date-shift-slotIndex) */
  const selectedSlotKeysForDay = useMemo(() => {
    const s = new Set<string>();
    selectedKeys.forEach((k) => {
      const parts = k.split("__");
      if (parts.length >= 4) s.add(`${parts[1]}-${parts[0]}-${parts[2]}-${parts[3]}`);
    });
    return s;
  }, [selectedKeys]);

  const selectedSlots = useMemo((): SlotSelection[] => {
    const list: SlotSelection[] = [];
    selectedKeys.forEach((key) => {
      const [date, resourceId, shift, slotIndexStr] = key.split("__");
      const slotIndex = parseInt(slotIndexStr ?? "0", 10);
      const duration = getSlotDurationMinutes(shift as Shift, slotIndex);
      list.push({ date, resourceId, shift: shift as Shift, slotIndex, durationMinutes: duration });
    });
    return list.sort((a, b) => a.date.localeCompare(b.date) || a.slotIndex - b.slotIndex);
  }, [selectedKeys]);

  const totalReservedMinutes = selectedSlots.reduce((s, x) => s + x.durationMinutes, 0);

  /** Si alguna ranura seleccionada es de la semana siguiente (cerrada a reserva desde el jueves): solo programar, no "Solo reservar" */
  const hasClosedWeekSlot = useMemo(
    () => selectedSlots.some((s) => isNextWeekReserveClosed(s.date)),
    [selectedSlots]
  );

  /** Pacientes ya programados por este cirujano/endoscopista (reservas con pacientes) */
  const misPacientesProgramados = useMemo(() => {
    const list: { date: string; resourceLabel: string; shift: Shift; patient: PatientInBlock; reservationId: string }[] = [];
    reservations
      .filter((r) => r.surgeonId === user?.id && r.patients?.length > 0)
      .forEach((r) => {
        const resourceLabel = RESOURCES.find((res) => res.id === r.resourceId)?.label ?? r.resourceId;
        r.patients.forEach((p) => {
          list.push({ date: r.date, resourceLabel, shift: r.shift, patient: p, reservationId: r.id });
        });
      });
    return list.sort((a, b) => a.date.localeCompare(b.date) || a.patient.order - b.patient.order);
  }, [reservations, user?.id]);

  if (!user || (user.role !== "cirujano" && user.role !== "endoscopista")) {
    return null;
  }

  const handleSoloReservar = () => {
    if (selectedSlots.length === 0) return;
    if (selectedSlots.some((s) => isNextWeekReserveClosed(s.date))) return;
    const now = new Date().toISOString();
    selectedSlots.forEach((slot) => {
      const res: Reservation = {
        id: `res-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        resourceId: slot.resourceId as ResourceId,
        date: slot.date,
        shift: slot.shift,
        slotIndex: slot.slotIndex,
        surgeonId: user.id,
        patients: [],
        status: "pending",
        createdAt: now,
      };
      addOrUpdateStoredReservation(res);
    });
    setSelectedKeys(new Set());
    refreshReservations();
    setNotification("Reserva realizada. Los huecos quedan reservados a su nombre.");
    setTimeout(() => setNotification(null), 4000);
  };

  const handleProgramarSave = (patients: Omit<PatientInBlock, "id" | "order">[], coSurgeonIds?: string[]) => {
    if (selectedSlots.length === 0) return;
    const now = new Date().toISOString();
    const patientsWithId: PatientInBlock[] = patients.map((p, i) => ({
      ...p,
      id: `pat-${Date.now()}-${i}`,
      order: i,
      admissionType: p.admissionType ?? "ambulatorio",
    }));
    const totalPatientMinutes = patientsWithId.reduce(
      (s, p) => s + p.estimatedDurationMinutes + 10,
      0
    );
    if (totalPatientMinutes > totalReservedMinutes) {
      setNotification("El tiempo total de los pacientes supera el tiempo reservado. No se ha guardado.");
      setTimeout(() => setNotification(null), 5000);
      return;
    }
    selectedSlots.forEach((slot, idx) => {
      const res: Reservation = {
        id: `res-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
        resourceId: slot.resourceId as ResourceId,
        date: slot.date,
        shift: slot.shift,
        slotIndex: slot.slotIndex,
        surgeonId: user.id,
        coSurgeonIds,
        patients: idx === 0 ? patientsWithId : [],
        status: "pending",
        createdAt: now,
      };
      addOrUpdateStoredReservation(res);
    });
    setSelectedKeys(new Set());
    setShowProgramarModal(false);
    refreshReservations();
    setNotification("Pacientes programados correctamente.");
    setTimeout(() => setNotification(null), 4000);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--ribera-navy)]">Bloque Quirúrgico</h1>
            <p className="mt-1 text-sm text-gray-600">
              Conectado como {user.name}
              {" · "}
              <button type="button" onClick={() => { logout(); router.replace("/"); }} className="font-medium text-[var(--ribera-red)] hover:underline">
                Cerrar sesión
              </button>
            </p>
          </div>
          <nav className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab("bloque")}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === "bloque" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}
            >
              Estado actual del bloque quirúrgico
            </button>
            <button
              type="button"
              onClick={() => setTab("pacientes")}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === "pacientes" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}
            >
              Mis pacientes programados
            </button>
            <button
              type="button"
              onClick={() => setTab("historico")}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === "historico" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}
            >
              Histórico
            </button>
            <button
              type="button"
              onClick={() => setTab("coordinacion")}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === "coordinacion" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}
            >
              Contactar coordinación
            </button>
            <button
              type="button"
              onClick={() => setTab("perfil")}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === "perfil" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}
            >
              Mi perfil
            </button>
          </nav>
        </header>

        {notification && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            {notification}
          </div>
        )}

        {tab === "perfil" && (
          <MiPerfil user={user} />
        )}

        {tab === "coordinacion" && (
          <ContactarCoordinacion user={user} />
        )}

        {tab === "pacientes" && (
          <section className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-xl font-bold text-[var(--ribera-navy)]">Mis pacientes programados</h2>
            <p className="mb-4 text-sm text-gray-600">
              Listado de pacientes que ya tiene programados en sus reservas de quirófano.
            </p>
            {misPacientesProgramados.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-8 text-center text-gray-500">Aún no tiene pacientes programados. Reserve huecos y use &quot;Reservar y programar pacientes&quot; para añadirlos.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Fecha</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Recurso</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Turno</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Paciente / Nº historia</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Procedimiento</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Duración</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Anestesia</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Entidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {misPacientesProgramados.map(({ date, resourceLabel, shift, patient }) => (
                      <tr key={`${date}-${resourceLabel}-${shift}-${patient.id}`} className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="px-3 py-2 text-gray-800">{new Date(date + "T12:00:00").toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}</td>
                        <td className="px-3 py-2 text-gray-800">{resourceLabel}</td>
                        <td className="px-3 py-2 text-gray-800">{shift === "morning" ? "Mañana" : "Tarde"}</td>
                        <td className="px-3 py-2">
                          <span className="font-medium text-gray-800">{patient.name || "—"}</span>
                          <span className="ml-1 text-gray-500">{patient.numeroHistoria}</span>
                        </td>
                        <td className="px-3 py-2 text-gray-700">{patient.procedure}</td>
                        <td className="px-3 py-2 text-gray-700">{patient.estimatedDurationMinutes} min</td>
                        <td className="px-3 py-2 text-gray-700">{patient.anesthesiaType}</td>
                        <td className="px-3 py-2 text-gray-700">{patient.entidadFinanciadora}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {tab === "historico" && (
          <HistoricoView user={user} reservations={reservations} />
        )}

        {tab === "bloque" && (
          <>
            <p className="text-sm text-gray-600">
              Seleccione una fecha en el calendario para ver el estado de reserva de los quirófanos.
            </p>
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
              <div className="shrink-0 max-w-[280px]">
                <WeekGridCalendar
                  periodStart={calendarPeriodStart}
                  onPeriodChange={setCalendarPeriodStart}
                  onSelectDay={(date) => {
                    setSelectedDateForGrid(date);
                    setWeekStart(getWeekStart(date));
                  }}
                  selectedDate={selectedDateForGrid}
                />
              </div>
              <div className="min-w-0 flex-1">
                {selectedDateForGrid ? (
                  <>
                    {selectedDateForGrid && isNextWeekReserveClosed(toISODate(selectedDateForGrid)) && (
                      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        Para esta semana (a partir del jueves) solo puede <strong>programar pacientes directamente</strong> en huecos libres; no puede reservar huecos vacíos.
                      </div>
                    )}
                    <div className="rounded-lg border border-gray-200 bg-white p-3 mb-4">
                      <p className="text-sm text-gray-600">
                        <span className="inline-block h-4 w-4 rounded bg-emerald-100 border border-emerald-300 align-middle" /> Libre
                        {" · "}
                        <span className="inline-block h-4 w-4 rounded bg-red-100 border border-red-300 align-middle" /> Ocupado por otro
                        {" · "}
                        <span className="inline-block h-4 w-4 rounded bg-amber-200 border border-amber-400 align-middle" /> Reservado por usted
                        {" · "}
                        <span className="inline-block h-4 w-4 rounded bg-white border border-gray-300 align-middle" /> Sus pacientes programados
                      </p>
                    </div>

                    {selectedKeys.size > 0 && (
                      <div className="flex flex-wrap items-center gap-4 rounded-lg border-2 border-[var(--ribera-red)] bg-ribera-red-pale p-4 mb-4">
                        <span className="font-medium text-gray-800">
                          Ha seleccionado {selectedKeys.size} hueco(s). Tiempo total: {totalReservedMinutes} min.
                        </span>
                        {hasClosedWeekSlot && (
                          <span className="text-sm text-amber-800">
                            Para la semana seleccionada solo puede programar pacientes (no reservar huecos vacíos).
                          </span>
                        )}
                        {!hasClosedWeekSlot && (
                          <button type="button" onClick={handleSoloReservar} className="btn-ribera-outline">
                            Solo reservar
                          </button>
                        )}
                        <button type="button" onClick={() => setShowProgramarModal(true)} className="btn-ribera-primary">
                          Reservar y programar pacientes
                        </button>
                        <button type="button" onClick={() => setSelectedKeys(new Set())} className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                          Cancelar selección
                        </button>
                      </div>
                    )}

                    <DaySlotGrid
                      date={selectedDateForGrid}
                      dateLabel={selectedDateForGrid.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                      allowedResources={allowedResources}
                      slotViews={slotViewsForSelectedDay}
                      onSlotSelect={handleSlotSelect}
                      selectedSlotKeys={selectedSlotKeysForDay}
                    />
                  </>
                ) : (
                  <p className="py-8 text-center text-gray-500 rounded-lg border border-gray-200 bg-white">
                    Elija un día en el calendario de la izquierda para ver el estado de reserva.
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {showProgramarModal && selectedSlots.length > 0 && (
<ProgramarPacientesModal
        slots={selectedSlots}
        currentUserId={user.id}
        onSave={handleProgramarSave}
        onClose={() => setShowProgramarModal(false)}
      />
      )}
    </div>
  );
}
