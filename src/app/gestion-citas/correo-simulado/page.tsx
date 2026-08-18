"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { modoDemo } from "@/lib/config";
import { hasGestionCitasAccess } from "@/lib/types";
import {
  getDemoOutgoingMail,
  setDemoOutgoingMailState,
  type DemoOutgoingMail,
  type DemoOutgoingMailCategory,
  type DemoOutgoingMailState,
} from "@/lib/demoOutgoingMail";
import { InlineNotice } from "@/components/ui/InlineNotice";

const FILTERS: Array<{ value: "TODOS" | DemoOutgoingMailCategory; label: string }> = [
  { value: "TODOS", label: "Todos" },
  { value: "NUEVA_CITA", label: "Nueva cita" },
  { value: "CAMBIO", label: "Cambio" },
  { value: "ANULACION", label: "Anulación" },
  { value: "HUECO_LIBERADO", label: "Hueco liberado" },
  { value: "AUTORIZACION_DENEGADA", label: "Autorización denegada" },
];

function stateLabel(state: DemoOutgoingMailState): string {
  if (state === "GENERADO") return "Generado";
  if (state === "PREPARADO") return "Preparado";
  return "Entrega simulada";
}

function nextState(state: DemoOutgoingMailState): DemoOutgoingMailState | null {
  if (state === "GENERADO") return "PREPARADO";
  if (state === "PREPARADO") return "ENTREGA_SIMULADA";
  return null;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export default function SimulatedOutgoingMailPage() {
  const router = useRouter();
  const { user, hydrated } = useAuth();
  const [items, setItems] = useState<DemoOutgoingMail[]>([]);
  const [filter, setFilter] = useState<"TODOS" | DemoOutgoingMailCategory>("TODOS");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!modoDemo) return;
    setItems(getDemoOutgoingMail().slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (!hasGestionCitasAccess(user.role)) {
      router.replace("/");
      return;
    }
    refresh();
  }, [hydrated, user, router, refresh]);

  const filtered = useMemo(
    () => filter === "TODOS" ? items : items.filter((item) => item.category === filter),
    [items, filter],
  );
  const selected = items.find((item) => item.id === selectedId) ?? null;

  if (!hydrated || !user || !hasGestionCitasAccess(user.role)) return null;

  if (!modoDemo) {
    return (
      <main className="mx-auto max-w-4xl p-4 md:p-6">
        <InlineNotice variant="warning">La bandeja de correo simulado solo existe en DEMO. No se utiliza como proveedor de correo real.</InlineNotice>
      </main>
    );
  }

  const advance = (item: DemoOutgoingMail) => {
    const next = nextState(item.state);
    if (!next) return;
    setDemoOutgoingMailState(item.id, next);
    refresh();
  };

  return (
    <main className="mx-auto w-full max-w-6xl p-4 md:p-6">
      <div className="mb-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-amber-950">
        <p className="text-base font-bold">🧪 DEMO — ESTE CORREO NO HA SALIDO DE QxFlow</p>
        <p className="mt-1 text-sm">Esta bandeja es local al navegador. No llama a `/api`, SMTP ni Microsoft Graph y no representa una entrega real.</p>
      </div>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <button type="button" onClick={() => router.push("/gestion-citas")} className="mb-2 text-sm font-medium text-[var(--ribera-navy)] hover:underline">← Volver a Gestión de citas</button>
          <h1 className="text-2xl font-bold text-[var(--ribera-navy)]">Bandeja de correo simulado</h1>
          <p className="mt-1 text-sm text-slate-600">Permite revisar qué aviso habría generado QxFlow, su destinatario y el momento exacto del evento.</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">Mensajes: <strong>{items.length}</strong></div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${filter === option.value ? "border-[var(--ribera-navy)] bg-[var(--ribera-navy)] text-white" : "border-slate-200 bg-white text-slate-700"}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <InlineNotice variant="info">No hay correos simulados en este filtro. Se irán generando al ejecutar los flujos de la DEMO.</InlineNotice>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-2">
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`w-full rounded-xl border p-4 text-left shadow-sm ${selectedId === item.id ? "border-[var(--ribera-navy)] bg-slate-50" : "border-slate-200 bg-white"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900">{item.subject}</p>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{stateLabel(item.state)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">Para: {item.recipientLabel}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDate(item.createdAt)}</p>
              </button>
            ))}
          </div>

          <section className="min-h-[320px] rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            {selected ? (
              <>
                <div className="mb-3 border-b border-slate-100 pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{selected.category.replaceAll("_", " ")}</p>
                      <h2 className="mt-1 font-semibold text-slate-900">{selected.subject}</h2>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">{stateLabel(selected.state)}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600"><strong>Para:</strong> {selected.recipientLabel}</p>
                  <p className="text-xs text-slate-500">Generado: {formatDate(selected.createdAt)}</p>
                </div>
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">🧪 DEMO — NO ENVIADO</div>
                <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-700">{selected.body}</pre>
                {nextState(selected.state) ? (
                  <button type="button" onClick={() => advance(selected)} className="mt-4 rounded-lg bg-[var(--ribera-navy)] px-3 py-2 text-sm font-medium text-white">
                    Simular paso a: {stateLabel(nextState(selected.state)!)}
                  </button>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-slate-500">Seleccione un correo de la lista para revisar el contenido exacto.</p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
