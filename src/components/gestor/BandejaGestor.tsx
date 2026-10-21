"use client";

import { useCallback, useEffect, useState } from "react";

interface DraftRow {
  id: string;
  status: string;
  subject: string;
  bodyText: string;
  warning?: string | null;
  recipients: Array<{ displayName: string; email: string }>;
}

interface ProposalRow {
  id: string;
  type: string;
  status: string;
  summary: string;
  weekStart: string;
}

export function BandejaGestor() {
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [reservationId, setReservationId] = useState("");
  const [endoscopists, setEndoscopists] = useState<Array<{ id: string; name: string }>>([]);
  const [endoscopyUserId, setEndoscopyUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [draftResponse, proposalResponse, recipientResponse] = await Promise.all([
      fetch("/api/outbound-drafts", { credentials: "same-origin" }),
      fetch("/api/proposals", { credentials: "same-origin" }),
      fetch("/api/service-recipients", { credentials: "same-origin" }),
    ]);
    const draftPayload = await draftResponse.json().catch(() => ({}));
    const proposalPayload = await proposalResponse.json().catch(() => ({}));
    const recipientPayload = await recipientResponse.json().catch(() => ({}));
    if (!draftResponse.ok) throw new Error((draftPayload as { error?: string }).error ?? "No se pudo cargar la bandeja");
    setDrafts((draftPayload as { drafts?: DraftRow[] }).drafts ?? []);
    setProposals((proposalPayload as { proposals?: ProposalRow[] }).proposals ?? []);
    setEndoscopists((recipientPayload as { endoscopists?: Array<{ id: string; name: string }> }).endoscopists ?? []);
    setEndoscopyUserId((recipientPayload as { endoscopyUserId?: string | null }).endoscopyUserId ?? "");
  }, []);

  useEffect(() => {
    load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudo cargar la bandeja"));
  }, [load]);

  const act = async (url: string, body?: unknown) => {
    setError(null);
    setMessage(null);
    const response = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((payload as { error?: string }).error ?? "La acción no se ha completado");
    setMessage("Hecho. El envío solo ocurre al pulsar Enviar en un borrador.");
    await load();
  };

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Bandeja de borradores</h2>
        <p className="text-sm text-gray-600">Nada sale ni se reserva solo. El gestor pulsa Enviar sobre un borrador concreto.</p>
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-800">{message}</p> : null}

      <form
        className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-white p-3"
        onSubmit={(event) => {
          event.preventDefault();
          act("/api/outbound-drafts", { reservationId }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Error"));
        }}
      >
        <label className="text-sm text-gray-700">
          Reserva
          <input value={reservationId} onChange={(event) => setReservationId(event.target.value)} className="mt-1 block rounded border border-gray-300 px-2 py-1" />
        </label>
        <button type="submit" className="rounded bg-[var(--ribera-navy)] px-3 py-2 text-sm text-white">Preparar borrador</button>
      </form>

      <form
        className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-white p-3"
        onSubmit={(event) => {
          event.preventDefault();
          fetch("/api/service-recipients", {
            method: "PUT",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: endoscopyUserId }),
          }).then(async (response) => {
            if (!response.ok) {
              const payload = await response.json().catch(() => ({}));
              throw new Error((payload as { error?: string }).error ?? "No se pudo guardar el endoscopista");
            }
            setMessage("Endoscopista de Endoscopias guardado.");
          }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Error"));
        }}
      >
        <label className="text-sm text-gray-700">
          Endoscopista de Endoscopias
          <select value={endoscopyUserId} onChange={(event) => setEndoscopyUserId(event.target.value)} className="mt-1 block rounded border border-gray-300 px-2 py-1">
            <option value="">Sin configurar</option>
            {endoscopists.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        </label>
        <button type="submit" className="rounded border border-gray-300 px-3 py-2 text-sm">Guardar destinatario</button>
      </form>

      <div className="space-y-3">
        {drafts.map((draft) => (
          <article key={draft.id} className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium text-gray-900">{draft.subject}</h3>
              <span className="text-xs uppercase text-gray-500">{draft.status}</span>
            </div>
            <pre className="whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs text-gray-800">{draft.bodyText}</pre>
            <p className="mt-2 text-xs text-gray-600">
              Para: {draft.recipients.map((recipient) => recipient.displayName).join(", ") || "sin destinatarios"}
              {draft.warning ? ` · ${draft.warning}` : ""}
            </p>
            {draft.status === "PENDING_APPROVAL" ? (
              <div className="mt-2 flex gap-2">
                <button type="button" className="rounded bg-[var(--ribera-red)] px-3 py-1.5 text-sm text-white" onClick={() => act(`/api/outbound-drafts/${draft.id}/send`).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Error"))}>Enviar</button>
                <button type="button" className="rounded border border-gray-300 px-3 py-1.5 text-sm" onClick={() => act(`/api/outbound-drafts/${draft.id}/reject`).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Error"))}>Rechazar</button>
              </div>
            ) : null}
          </article>
        ))}
      </div>

      <div>
        <h3 className="mb-2 font-medium text-gray-900">Propuestas pendientes</h3>
        <ul className="space-y-2">
          {proposals.filter((proposal) => proposal.status === "PENDING").map((proposal) => (
            <li key={proposal.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 bg-white px-3 py-2 text-sm">
              <span>{proposal.weekStart} · {proposal.type} · {proposal.summary}</span>
              <span className="flex gap-2">
                <button type="button" className="rounded border border-gray-300 px-2 py-1" onClick={() => act(`/api/proposals/${proposal.id}/decision`, { action: "approve" }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Error"))}>Aprobar</button>
                <button type="button" className="rounded border border-gray-300 px-2 py-1" onClick={() => act(`/api/proposals/${proposal.id}/decision`, { action: "reject", reason: "Rechazada por el gestor" }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Error"))}>Rechazar</button>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
