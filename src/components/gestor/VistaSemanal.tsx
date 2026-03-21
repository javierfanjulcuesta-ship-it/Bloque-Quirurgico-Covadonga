"use client";

/**
 * Gestor: vista de toda la semana con reservas y pacientes.
 * Los pacientes de financiación privada se muestran remarcados (naranja).
 */

import { useState, useMemo } from "react";
import { getWeekStart, getWeekDays, toISODate } from "@/lib/utils";
import { getReservationsInPeriod, getUsers } from "@/lib/dataHelpers";
import { RESOURCES } from "@/lib/constants";
import { WeekNavigation } from "@/components/calendar/WeekNavigation";
import type { Reservation, User } from "@/lib/types";

function isPrivateFunding(entidadFinanciadora: string | undefined): boolean {
  if (!entidadFinanciadora || !entidadFinanciadora.trim()) return false;
  return /privad/i.test(entidadFinanciadora.trim());
}

export function VistaSemanal({
  storedReservations = [],
  addedUsers = [],
}: {
  storedReservations?: Reservation[];
  addedUsers?: User[];
} = {}) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const from = toISODate(weekDays[0]);
  const to = toISODate(weekDays[weekDays.length - 1]);
  const reservations = useMemo(
    () => getReservationsInPeriod(from, to, storedReservations),
    [from, to, storedReservations]
  );
  const users = useMemo(() => getUsers(addedUsers), [addedUsers]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Toda la semana. Los pacientes de <strong>financiación privada</strong> se muestran en naranja.
      </p>
      <WeekNavigation weekStart={weekStart} onWeekChange={setWeekStart} canGoNext={true} />
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        {reservations.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-6 text-center text-gray-500">No hay reservas en esta semana.</p>
        ) : (
          <div className="space-y-6">
            {weekDays.map((day) => {
              const dateStr = toISODate(day);
              const dayReservations = reservations.filter((r) => r.date === dateStr);
              const dayLabel = day.toLocaleDateString("es-ES", {
                weekday: "long",
                day: "numeric",
                month: "long",
              });
              return (
                <div key={dateStr} className="rounded-xl border border-gray-200">
                  <div className="border-b border-gray-200 bg-ribera-gray-light px-4 py-2 font-semibold capitalize text-gray-800">
                    {dayLabel}
                  </div>
                  <div className="divide-y divide-gray-100">
                    {dayReservations.length === 0 ? (
                      <p className="p-4 text-sm text-gray-400">Ninguna reserva este día</p>
                    ) : (
                      dayReservations.map((res) => (
                        <ReservationBlock key={res.id} reservation={res} users={users} />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ReservationBlock({ reservation, users }: { reservation: Reservation; users: User[] }) {
  const surgeon = users.find((u) => u.id === reservation.surgeonId);
  const resourceLabel = RESOURCES.find((r) => r.id === reservation.resourceId)?.label ?? reservation.resourceId;
  const shiftLabel = reservation.shift === "morning" ? "Mañana" : "Tarde";

  return (
    <div className="p-4">
      <p className="mb-2 text-sm font-medium text-gray-700">
        {resourceLabel} – {shiftLabel} – {surgeon?.name ?? "-"}
      </p>
      <ul className="space-y-1">
        {reservation.patients.map((p) => {
          const privada = isPrivateFunding(p.entidadFinanciadora);
          return (
            <li
              key={p.id}
              className={`rounded px-3 py-2 text-sm ${
                privada
                  ? "border border-orange-300 bg-orange-100 text-orange-900"
                  : "bg-gray-50 text-gray-800"
              }`}
            >
              <span className="font-medium">{p.numeroHistoria}</span>
              {" – "}
              {p.procedure}
              {p.estimatedDurationMinutes ? ` (${p.estimatedDurationMinutes} min)` : ""}
              {" – "}
              <span className={privada ? "font-semibold" : ""}>
                {p.entidadFinanciadora || "—"}
                {privada && " (privada)"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
