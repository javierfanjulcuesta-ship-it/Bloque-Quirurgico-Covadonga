"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/context/AuthContext";
import { modoDemo } from "@/lib/config";
import { getDemoAuditEvents } from "@/lib/demoAudit";
import type { DemoAuditEvent } from "@/lib/demoAudit";

const ACTION_LABELS: Record<DemoAuditEvent["action"], string> = {
  "reservation.created": "Reserva creada",
  "reservation.cancelled": "Reserva anulada",
  "patient.updated": "Paciente actualizado",
  "patient.cancelled": "Paciente anulado",
};

export default function DemoAuditoriaPage() {
  const router = useRouter();
  const { user, hydrated } = useAuth();
  const [events, setEvents] = useState<DemoAuditEvent[]>([]);

  const refresh = () => {
    if (!modoDemo) return;
    setEvents([...getDemoAuditEvents()].reverse());
  };

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace("/");
      return;
    }
    refresh();
  }, [hydrated, user, router]);

  if (!hydrated || !user) return null;

  if (!modoDemo) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Esta superficie existe exclusivamente para revisar la auditoría sintética de la preproducción DEMO aislada.
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <header className="rounded-xl border border-red-100 bg-red-50/60 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ribera-red)]">Solo preproducción DEMO</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--ribera-navy)]">Auditoría sintética</h1>
        <p className="mt-2 text-sm text-slate-600">
          Esta bitácora vive solo en el navegador. Registra acciones e identificadores técnicos; no almacena nombres, historia clínica, procedimientos, contactos ni notas.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => router.back()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Volver
          </button>
          <button type="button" onClick={refresh} className="rounded-lg bg-[var(--ribera-red)] px-4 py-2 text-sm font-medium text-white">
            Actualizar auditoría
          </button>
        </div>
      </header>

      {events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Todavía no hay eventos DEMO. Cree, edite o anule una reserva/paciente ficticio y vuelva a actualizar.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-700">
                <th className="px-4 py-3 font-semibold">Fecha/hora</th>
                <th className="px-4 py-3 font-semibold">Acción</th>
                <th className="px-4 py-3 font-semibold">Entidad</th>
                <th className="px-4 py-3 font-semibold">ID entidad</th>
                <th className="px-4 py-3 font-semibold">ID reserva</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-3 text-slate-600">{new Date(event.timestamp).toLocaleString("es-ES")}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{ACTION_LABELS[event.action]}</td>
                  <td className="px-4 py-3 text-slate-600">{event.entityType === "reservation" ? "Reserva" : "Paciente"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{event.entityId}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{event.reservationId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
