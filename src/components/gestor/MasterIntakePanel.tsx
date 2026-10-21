"use client";

import { useState } from "react";

interface PublicRow {
  rowNumber: number;
  serviceDate: string;
  shift: string | null;
  resourceId: string | null;
  surgeonName: string | null;
  procedure: string;
  status: string;
  flags: string[];
}

interface SessionReview {
  status: string;
  missingCount: number;
  persisted: boolean;
  rows: PublicRow[];
  parte: string;
  alerts: Array<{ kind: string }>;
}

export function MasterIntakePanel() {
  const [review, setReview] = useState<SessionReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const upload = async (file: File) => {
    setError(null);
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
      body: JSON.stringify({ contentBase64 }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((payload as { error?: string }).error ?? "No se pudo revisar el Excel");
    setReview(payload as SessionReview);
  };

  const download = async () => {
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
        Las hojas 1_PROGRAMA y DATOS_IQ se revisan en esta sesión. No se guardan nombre, historia, teléfono ni email.
        Si el servidor tiene sal, solo persiste una huella no reversible para detectar otro fichero incompleto o un nombre distinto.
      </p>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      <label className="mt-3 inline-block rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
        Revisar maestro
        <input
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) upload(file).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudo revisar"));
          }}
        />
      </label>
      {review ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-slate-700">
            Estado {review.status}. Filas de esta sesión: {review.rows.length}. Faltan respecto al fichero anterior: {review.missingCount}.
            {review.persisted ? " Huellas guardadas." : " Sin sal de servidor: no se guarda la comparación."}
            {" "}Alertas: {review.alerts.length}.
          </p>
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-slate-500">
                <th className="px-2 py-1">Fila</th>
                <th className="px-2 py-1">Fecha</th>
                <th className="px-2 py-1">Procedimiento</th>
                <th className="px-2 py-1">Cirujano</th>
                <th className="px-2 py-1">Estado</th>
              </tr>
            </thead>
            <tbody>
              {review.rows.map((row) => (
                <tr key={row.rowNumber} className="border-t border-slate-100">
                  <td className="px-2 py-2">{row.rowNumber}</td>
                  <td className="px-2 py-2">{row.serviceDate} {row.shift ?? ""} {row.resourceId ?? "sin sala"}</td>
                  <td className="px-2 py-2">{row.procedure}</td>
                  <td className="px-2 py-2">{row.surgeonName ?? "—"}</td>
                  <td className="px-2 py-2">{row.status}{row.flags.length ? ` · ${row.flags.join(", ")}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {review.parte ? (
            <pre className="overflow-x-auto rounded bg-slate-50 p-3 text-xs text-slate-800">{review.parte}</pre>
          ) : null}
        </div>
      ) : null}
      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          download().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudo exportar"));
        }}
      >
        <label className="text-sm text-slate-700">Desde<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 block rounded border border-slate-300 px-2 py-1" /></label>
        <label className="text-sm text-slate-700">Hasta<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 block rounded border border-slate-300 px-2 py-1" /></label>
        <button type="submit" className="rounded border border-slate-300 px-3 py-2 text-sm">Exportar agregados de la semana</button>
      </form>
    </section>
  );
}
