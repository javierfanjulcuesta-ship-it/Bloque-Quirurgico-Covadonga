"use client";

/**
 * Página de demostración del calendario V2: rangos horarios, días, colores (libre/reservado/ocupado)
 * y vista gestor con pacientes privados remarcados.
 * Para ver el estado actual de la V2: http://localhost:3000/calendario
 */

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { roleLabel, hasGestorAccess } from "@/lib/types";
import { getAllowedResourcesForRole, RESOURCES } from "@/lib/constants";
import { getWeekStart, toISODate } from "@/lib/utils";
import { getStoredReservations, getMessagesToGestor } from "@/lib/storageMensajesYNotificaciones";
import { buildSlotViews, getUsers } from "@/lib/dataHelpers";
import { WeekCalendar } from "@/components/calendar/WeekCalendar";
import { WeekGridCalendar } from "@/components/calendar/WeekGridCalendar";
import { DaySlotGrid } from "@/components/calendar/DaySlotGrid";
import { VistaSemanal } from "@/components/gestor/VistaSemanal";
import { ConsultaPreanestesiaRow } from "@/components/calendar/ConsultaPreanestesiaRow";
import { MiPerfil } from "@/components/MiPerfil";
import { ContactarCoordinacion } from "@/components/ContactarCoordinacion";
import { HistoricoView } from "@/components/HistoricoView";
import { CrearNuevoUsuario } from "@/components/gestor/CrearNuevoUsuario";
import { AsignarAnestesistas } from "@/components/gestor/AsignarAnestesistas";
import type { Reservation } from "@/lib/types";
import { hasAnesthetistAccess } from "@/lib/types";

export default function CalendarioPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  type TabId = "calendario" | "perfil" | "coordinacion" | "crear-usuario" | "asignar-anestesistas" | "mensajes" | "historico";
  const [viewTab, setViewTab] = useState<TabId>("calendario");
  const isAnestesista = user ? hasAnesthetistAccess(user.role) : false;
  const [selectedDateForGrid, setSelectedDateForGrid] = useState<Date | null>(null);
  const [calendarPeriodStart, setCalendarPeriodStart] = useState(() => getWeekStart(new Date()));
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [reservations, setReservations] = useState<Reservation[]>([]);

  useEffect(() => {
    setReservations(getStoredReservations());
  }, []);

  const handleLogout = () => {
    logout();
    router.replace("/");
  };

  const isGestor = user ? hasGestorAccess(user.role) : false;
  const allowedResourceIds = user ? getAllowedResourcesForRole(user.role) : undefined;

  const slotViews = useMemo(
    () =>
      buildSlotViews(weekStart, reservations, {
        asGestor: isGestor,
        currentUserId: user?.id,
        users: getUsers(),
      }),
    [weekStart, reservations, isGestor, user?.id]
  );

  /** Vista del día seleccionado: columnas = recursos, filas = rangos (gestor/anestesista) */
  const allowedResources = useMemo(
    () => (allowedResourceIds ? RESOURCES.filter((r) => allowedResourceIds.includes(r.id)) : RESOURCES),
    [allowedResourceIds]
  );
  const slotViewsForSelectedDay = useMemo(() => {
    if (!selectedDateForGrid || !(isGestor || isAnestesista)) return [];
    const weekStartForDay = getWeekStart(selectedDateForGrid);
    const allViews = buildSlotViews(weekStartForDay, reservations, {
      asGestor: true,
      currentUserId: user?.id,
      users: getUsers(),
    });
    const dateStr = toISODate(selectedDateForGrid);
    return allViews.filter((v) => v.date === dateStr && allowedResources.some((r) => r.id === v.resourceId));
  }, [selectedDateForGrid, reservations, user?.id, isGestor, isAnestesista, allowedResources]);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="border-b border-gray-200 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-[var(--ribera-navy)]">
                Bloque Quirúrgico – Calendario
              </h1>
              {user && (
                <p className="mt-1 text-sm text-gray-600">
                  <span className="font-medium text-[var(--ribera-navy)]">Perfil: {roleLabel(user.role)}</span>
                  {" · "}
                  Conectado como {user.name}
                  {" · "}
                  <button type="button" onClick={handleLogout} className="font-medium text-[var(--ribera-red)] hover:underline">Cerrar sesión</button>
                </p>
              )}
            </div>
            {user && (
              <nav className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setViewTab("calendario")} className={`rounded-lg px-4 py-2 text-sm font-medium ${viewTab === "calendario" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}>
                  Calendario
                </button>
                {isGestor && (
                  <>
                    <button type="button" onClick={() => setViewTab("mensajes")} className={`rounded-lg px-4 py-2 text-sm font-medium ${viewTab === "mensajes" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}>
                      Mensajes
                    </button>
                    <button type="button" onClick={() => setViewTab("crear-usuario")} className={`rounded-lg px-4 py-2 text-sm font-medium ${viewTab === "crear-usuario" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}>
                      Crear nuevo usuario
                    </button>
                    <button type="button" onClick={() => setViewTab("asignar-anestesistas")} className={`rounded-lg px-4 py-2 text-sm font-medium ${viewTab === "asignar-anestesistas" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}>
                      Asignar anestesistas
                    </button>
                  </>
                )}
                {isAnestesista && (
                  <button type="button" onClick={() => setViewTab("historico")} className={`rounded-lg px-4 py-2 text-sm font-medium ${viewTab === "historico" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}>
                    Histórico
                  </button>
                )}
                <button type="button" onClick={() => setViewTab("coordinacion")} className={`rounded-lg px-4 py-2 text-sm font-medium ${viewTab === "coordinacion" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}>
                  Contactar coordinación
                </button>
                <button type="button" onClick={() => setViewTab("perfil")} className={`rounded-lg px-4 py-2 text-sm font-medium ${viewTab === "perfil" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}>
                  Mi perfil
                </button>
              </nav>
            )}
          </div>
          {viewTab === "calendario" && (
            <p className="mt-2 text-sm text-gray-600">
              Seleccione una fecha en el calendario para ver el estado del bloque. Mismo estado para gestor y anestesista; pacientes privados en naranja.
            </p>
          )}
        </header>

        {user && viewTab === "perfil" && (
          <MiPerfil user={user} />
        )}

        {user && viewTab === "coordinacion" && (
          <ContactarCoordinacion user={user} />
        )}

        {user && isGestor && viewTab === "crear-usuario" && (
          <CrearNuevoUsuario />
        )}

        {user && isGestor && viewTab === "asignar-anestesistas" && (
          <AsignarAnestesistas reservations={reservations} />
        )}

        {user && isGestor && viewTab === "mensajes" && (
          <section className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-xl font-bold text-[var(--ribera-navy)]">Mensajes recibidos</h2>
            <p className="mb-4 text-sm text-gray-600">
              Mensajes enviados por cirujanos, anestesistas y otros usuarios desde Mi perfil → Contactar a la coordinación.
            </p>
            <div className="space-y-4">
              {getMessagesToGestor().length === 0 ? (
                <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-8 text-center text-gray-500">No hay mensajes.</p>
              ) : (
                getMessagesToGestor().map((msg) => (
                  <article key={msg.id} className="rounded-lg border border-gray-200 bg-gray-50/50 p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[var(--ribera-navy)]">{msg.fromName}</span>
                      {msg.fromEmail && <span className="text-sm text-gray-500">{msg.fromEmail}</span>}
                      <span className="text-sm text-gray-400">{new Date(msg.date).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}</span>
                    </div>
                    <h3 className="mb-1 font-medium text-gray-800">{msg.subject}</h3>
                    <p className="whitespace-pre-wrap text-sm text-gray-700">{msg.body}</p>
                  </article>
                ))
              )}
            </div>
          </section>
        )}

        {user && viewTab === "historico" && (
          <HistoricoView user={user} reservations={reservations} />
        )}

        {viewTab === "calendario" && (
          <>
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
              <div className="shrink-0">
                <div className="rounded-lg border border-[var(--ribera-red)]/20 bg-white p-4 shadow-sm">
                  <p className="mb-3 text-sm font-semibold text-[var(--ribera-navy)]">1. Elija un día</p>
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
              </div>
              <div className="min-w-0 flex-1">
                {selectedDateForGrid ? (
                  <>
                    {(isGestor || isAnestesista) && (
                      <>
                        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                          <p className="text-sm font-medium text-gray-800">
                            <span className="text-[var(--ribera-navy)]">2. Estado del día</span>
                            {" · "}
                            {selectedDateForGrid.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            Verde = libre · Amarillo = reservado · Blanco = pacientes programados · Naranja = paciente privado
                          </p>
                        </div>
                        <section className="mb-6">
                          <DaySlotGrid
                            date={selectedDateForGrid}
                            dateLabel={selectedDateForGrid.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                            allowedResources={allowedResources}
                            slotViews={slotViewsForSelectedDay}
                          />
                        </section>
                        <section className="mb-6">
                          <h2 className="mb-2 text-base font-semibold text-gray-800">Consulta de preanestesia (lun y jue, mañana)</h2>
                          <ConsultaPreanestesiaRow weekStart={weekStart} />
                        </section>
                        <section>
                          <h2 className="mb-2 text-base font-semibold text-gray-800">Listado de la semana</h2>
                          <VistaSemanal storedReservations={reservations} />
                        </section>
                      </>
                    )}

                    {!isGestor && !isAnestesista && (
                      <section className="mb-6">
                        <h2 className="mb-2 text-lg font-semibold text-gray-800">Calendario semanal</h2>
                        <WeekCalendar
                          weekStart={weekStart}
                          onWeekChange={setWeekStart}
                          slotViews={slotViews}
                          showDetails={false}
                          canScheduleNextWeek={true}
                          allowedResourceIds={allowedResourceIds}
                        />
                      </section>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-16 px-6 text-center">
                    <p className="mb-1 text-lg font-medium text-gray-700">Ver estado del bloque</p>
                    <p className="text-sm text-gray-500">Elija un día en el calendario de la izquierda para cargar la semana y ver quirófanos, programación y consulta de preanestesia.</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
