"use client";

/**
 * Pestaña "Normas de programación" en área cirujano. Solo lectura.
 */

import { useState, useEffect } from "react";

interface ProgrammingRulePublic {
  key: string;
  name: string;
  content: string;
}

export function NormasProgramacionView() {
  const [rules, setRules] = useState<ProgrammingRulePublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/programming-rules")
      .then((r) => {
        if (!r.ok) throw new Error("Error al cargar");
        return r.json();
      })
      .then((data) => setRules(data.rules ?? []))
      .catch(() => setError("No se han podido cargar las normas."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-2 text-xl font-bold text-[var(--ribera-navy)]">Normas de programación</h2>
        <p className="text-sm text-gray-500">Cargando…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-2 text-xl font-bold text-[var(--ribera-navy)]">Normas de programación</h2>
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</p>
        <p className="mt-4 text-sm text-gray-600">En caso de duda, puede contactar con la coordinación en la pestaña &quot;Contactar coordinación&quot;.</p>
      </section>
    );
  }

  if (rules.length === 0) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-2 text-xl font-bold text-[var(--ribera-navy)]">Normas de programación</h2>
        <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-8 text-center text-gray-500">
          No hay normas de programación disponibles en este momento.
        </p>
        <p className="mt-4 text-sm text-gray-600">En caso de duda, puede contactar con la coordinación en la pestaña &quot;Contactar coordinación&quot;.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-2 text-xl font-bold text-[var(--ribera-navy)]">Normas de programación</h2>
      <p className="mb-4 text-sm text-gray-600">
        Normas operativas del bloque quirúrgico. Solo lectura.
      </p>
      <div className="space-y-6">
        {rules.map((r) => (
          <div key={r.key} className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
            <h3 className="mb-3 font-semibold text-gray-800">{r.name}</h3>
            <div className="whitespace-pre-line text-sm leading-relaxed text-gray-700">
              {r.content}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-lg border border-red-100 bg-red-50/50 p-4">
        <p className="text-sm text-gray-800">
          <strong>En caso de duda,</strong> puede contactar con la coordinación en la pestaña &quot;Contactar coordinación&quot;.
        </p>
      </div>
    </section>
  );
}
