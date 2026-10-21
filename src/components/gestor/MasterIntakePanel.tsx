"use client";

import { useCallback, useEffect, useState } from "react";

interface IntakeListRow {
  id: string;
  historyNumber: string;
  patientName: string;
  procedure: string;
  serviceDate: string;
  shift: string | null;
  resourceId: string | null;
  slotIndex: number | null;
  surgeonName: string | null;
  status: string;
  flags: string;
  suggestedShift: string | null;
  suggestedResourceId: string | null;
  reservationId: string | null;
  batchStatus: string;
}

export function MasterIntakePanel() {
  const [rows, setRows] = useState<IntakeListRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/intake/rows", { credentials: "same-origin" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((payload as { error?: string }).error ?? "No se pudieron cargar las filas");
    setRows((payload as { rows?: IntakeListRow[] }).rows ?? []);
  }, []);

  useEffect(() => {
    load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudieron cargar las filas"));
  }, [load]);

  const upload = async (file: File) => {
    setError(null);
    setMessage(null);
    const contentBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result ?? "");
        resolve(text.includes(",") ? text.slice(text.indexOf(",") + 1) : text);
      };
      reader.onerror = () => reject(new Error("No se pudo leer el Excel"));
      reader.readAsDataURL(file);
    });
    const response = await fetch("/api/intake/import", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, contentBase64 }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((payload as { error?: string }).error ?? "No se pudo importar");
    const status = (payload as { status?: string }).status;
    setMessage(status === "FUENTE_INCOMPLETA"
      ? "Importado con aviso FUENTE_INCOMPLETA. Las filas anteriores se mantienen."
      : "Filas guardadas para revisión. Ninguna reserva se ha creado.");
    await load();
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    const response = await fetch(`/api/intake/rows/${id}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((payload as { error?: string }).error ?? "No se pudo actualizar la fila");
    await load();
  };

  const approve = async (id: string) => {
    setError(null);
    const response = await fetch(`/api/intake/rows/${id}/approve`, { method: "POST", credentials: "same-origin" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((payload as { error?: string }).error ?? "No se ha creado la reserva");
    setMessage("Reserva creada desde la fila aprobada.");
    await load();
  };

  const download = async () => {
    setError(null);
    const response = await fetch(`/api/intake/week-export?from=${from}&to=${to}`, { credentials: "same-origin" });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error((payload as { error?: string }).error ?? "No se pudo exportar");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `semana-${from}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-bold text-[var(--ribera-navy)]">Excel maestro</h2>
      <p className="mt-1 text-sm text-slate-600">
        Lee solo las hojas 1_PROGRAMA y DATOS_IQ. Las filas quedan en revisión. La reserva se crea al aprobar una fila completa.
      </p>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="mt-2 text-sm text-emerald-800">{message}</p> : null}
      <label className="mt-3 inline-block rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
        Importar maestro
        <input
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) upload(file).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudo importar"));
          }}
        />
      </label>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-slate-500">
              <th className="px-2 py-1">Fecha</th>
              <th className="px-2 py-1">Paciente</th>
              <th className="px-2 py-1">Procedimiento</th>
              <th className="px-2 py-1">Turno</th>
              <th className="px-2 py-1">Quirófano</th>
              <th className="px-2 py-1">Tramo</th>
              <th className="px-2 py-1">Estado</th>
              <th className="px-2 py-1"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-2 py-2">{row.serviceDate}</td>
                <td className="px-2 py-2">{row.patientName}<div className="text-xs text-slate-500">{row.historyNumber}</div></td>
                <td className="px-2 py-2">{row.procedure}</td>
                <td className="px-2 py-2">
                  <select
                    aria-label={`Turno de ${row.historyNumber}`}
                    value={row.shift ?? ""}
                    onChange={(event) => {
                      patch(row.id, { shift: event.target.value }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Error"));
                    }}
                    className="rounded border border-slate-300 px-1 py-1"
                  >
                    <option value="">{row.suggestedShift ? `Sugerido ${row.suggestedShift}` : "Sin turno"}</option>
                    <option value="morning">Mañana</option>
                    <option value="afternoon">Tarde</option>
                  </select>
                </td>
                <td className="px-2 py-2">
                  <select
                    aria-label={`Quirófano de ${row.historyNumber}`}
                    value={row.resourceId ?? ""}
                    onChange={(event) => {
                      patch(row.id, { resourceId: event.target.value }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Error"));
                    }}
                    className="rounded border border-slate-300 px-1 py-1"
                  >
                    <option value="">{row.suggestedResourceId ? `Sugerido ${row.suggestedResourceId}` : "Sin quirófano"}</option>
                    <option value="Q1">Q1</option>
                    <option value="Q2">Q2</option>
                    <option value="Q3">Q3</option>
                    <option value="procedimientos-menores">Menores</option>
                    <option value="tecnicas-dolor">Dolor</option>
                  </select>
                </td>
                <td className="px-2 py-2">
                  <select
                    aria-label={`Tramo de ${row.historyNumber}`}
                    value={row.slotIndex ?? ""}
                    onChange={(event) => {
                      patch(row.id, { slotIndex: Number(event.target.value) }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Error"));
                    }}
                    className="rounded border border-slate-300 px-1 py-1"
                  >
                    <option value="">Tramo</option>
                    {[0, 1, 2, 3, 4, 5].map((slot) => <option key={slot} value={slot}>{slot}</option>)}
                  </select>
                </td>
                <td className="px-2 py-2">
                  <div>{row.status}</div>
                  {row.flags ? <div className="text-xs text-amber-800">{row.flags}</div> : null}
                  {row.batchStatus === "FUENTE_INCOMPLETA" ? <div className="text-xs text-amber-800">FUENTE_INCOMPLETA</div> : null}
                </td>
                <td className="px-2 py-2">
                  {row.reservationId ? (
                    <span className="text-xs text-slate-500">Reserva {row.reservationId.slice(0, 8)}</span>
                  ) : (
                    <button type="button" className="rounded bg-[var(--ribera-navy)] px-2 py-1 text-xs text-white" onClick={() => approve(row.id).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Error"))}>
                      Aprobar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          download().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudo exportar"));
        }}
      >
        <label className="text-sm text-slate-700">Desde<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 block rounded border border-slate-300 px-2 py-1" /></label>
        <label className="text-sm text-slate-700">Hasta<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 block rounded border border-slate-300 px-2 py-1" /></label>
        <button type="submit" className="rounded border border-slate-300 px-3 py-2 text-sm">Exportar semana</button>
      </form>
    </section>
  );
}
