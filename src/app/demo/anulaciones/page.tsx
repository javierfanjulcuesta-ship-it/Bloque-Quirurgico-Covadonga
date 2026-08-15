"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/context/AuthContext";
import { modoDemo } from "@/lib/config";
import {
  cancelPatient,
  cancelReservationEntry,
  getReservations,
  ReservationsApiError,
} from "@/lib/reservations";
import { RESOURCES } from "@/lib/constants";
import { hasGestorAccess } from "@/lib/types";
import type { Reservation } from "@/lib/types";

export default function DemoAnulacionesPage() {
  const router = useRouter();
  const { user, hydrated } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!modoDemo || !user) return;
    setLoading(true);
    setError(null);
    try {
      const list = await getReservations();
      setReservations(list);
    } catch (err) {
      setError(err instanceof ReservationsApiError ? err.message : "No se pudieron cargar las reservas DEMO.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace("/");
      return;
    }
    void refresh();
  }, [hydrated, user, router, refresh]);

  const visibleReservations = useMemo(() => {
    if (!user) return [];
    const showAll = hasGestorAccess(user.role);
    return reservations
      .filter((reservation) => reservation.status !== "cancelled" && reservation.status !== "released")
      .filter((reservation) => showAll || reservation.surgeonId === user.id)
      .sort((a, b) => a.date.localeCompare(b.date) || a.shift.localeCompare(b.shift) || a.slotIndex - b.slotIndex);
  }, [reservations, user]);

  if (!hydrated || !user) return null;

  if (!modoDemo) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Esta superficie existe exclusivamente para validar anulaciones en la preproducción DEMO aislada.
        </div>
      </main>
    );
  }

  const handleCancelPatient = async (reservationId: string, patientId: string) => {
    const key = `patient:${reservationId}:${patientId}`;
    if (busyKey) return;
    setBusyKey(key);
    setMessage(null);
    setError(null);
    try {
      const result = await cancelPatient(reservationId, patientId, "Prueba DEMO");
      setMessage(result.message ?? "Paciente anulado en DEMO.");
      await refresh();
    } catch (err) {
      setError(err instanceof ReservationsApiError ? err.message : "No se pudo anular el paciente DEMO.");
    } finally {
      setBusyKey(null);
    }
  };

  const handleCancelReservation = async (reservation: Reservation) => {
    const key = `reservation:${reservation.id}`;
    if (busyKey) return;
    setBusyKey(key);
    setMessage(null);
    setError(null);
    try {
      await cancelReservationEntry(reservation.id, "Prueba DEMO", { force: reservation.patients.length > 0 });
      setMessage("Reserva anulada localmente en DEMO.");
      await refresh();
    } catch (err) {
      setError(err instanceof ReservationsApiError ? err.message : "No se pudo anular la reserva DEMO.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <header className="rounded-xl border border-red-100 bg-red-50/60 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ribera-red)]">Solo preproducción DEMO</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--ribera-navy)]">Prueba de anulaciones</h1>
        <p className="mt-2 text-sm text-slate-600">
          Esta pantalla usa exclusivamente las reservas ficticias guardadas en este navegador. No llama a la API ni a la base de datos real.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => router.back()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Volver
          </button>
          <button type="button" onClick={() => void refresh()} disabled={loading || !!busyKey} className="rounded-lg bg-[var(--ribera-red)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {loading ? "Actualizando…" : "Actualizar"}
          </button>
        </div>
      </header>

      {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</div>}
      {error && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</div>}

      {visibleReservations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No hay reservas DEMO activas para este perfil. Cargue datos de ejemplo o cree una reserva ficticia primero.
        </div>
      ) : (
        <div className="space-y-3">
          {visibleReservations.map((reservation) => {
            const resourceLabel = RESOURCES.find((resource) => resource.id === reservation.resourceId)?.label ?? reservation.resourceId;
            return (
              <article key={reservation.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                  <div>
                    <h2 className="font-semibold text-slate-900">
                      {reservation.date} · {resourceLabel} · {reservation.shift === "morning" ? "Mañana" : "Tarde"} · tramo {reservation.slotIndex + 1}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">Reserva DEMO: {reservation.id}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCancelReservation(reservation)}
                    disabled={!!busyKey}
                    className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-900 hover:bg-rose-100 disabled:opacity-50"
                  >
                    {busyKey === `reservation:${reservation.id}` ? "Anulando…" : "Anular reserva"}
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  {reservation.patients.length === 0 ? (
                    <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">Reserva vacía.</p>
                  ) : (
                    reservation.patients.map((patient) => (
                      <div key={patient.id} className="flex flex-col justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3 sm:flex-row sm:items-center">
                        <div>
                          <p className="text-sm font-medium text-slate-800">{patient.name || patient.numeroHistoria || "Paciente DEMO"}</p>
                          <p className="text-xs text-slate-500">{patient.procedure} · {patient.estimatedDurationMinutes} min</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleCancelPatient(reservation.id, patient.id)}
                          disabled={!!busyKey}
                          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                        >
                          {busyKey === `patient:${reservation.id}:${patient.id}` ? "Anulando…" : "Anular paciente"}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
