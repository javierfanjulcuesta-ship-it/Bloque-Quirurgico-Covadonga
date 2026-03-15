"use client";

/**
 * Pestaña del gestor: crear nuevo usuario. Pide perfil (anestesista, gestor, cirujano, endoscopista) y correo,
 * y abre el cliente de correo con plantilla de invitación (mailto).
 */

import { useState } from "react";
import { getEmailSubject, getEmailBody, buildMailtoLink } from "@/lib/emailsNuevoUsuario";
import { roleLabel } from "@/lib/types";
import type { UserRole } from "@/lib/types";

const ROLES_FOR_INVITE: UserRole[] = ["anestesista", "gestor", "cirujano", "endoscopista"];

export function CrearNuevoUsuario() {
  const [profile, setProfile] = useState<UserRole>("cirujano");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const handleEnviar = () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    const subject = getEmailSubject(profile);
    const accessLink = typeof window !== "undefined" ? window.location.origin : "";
    const body = getEmailBody(profile, { accessLink });
    const mailto = buildMailtoLink(trimmed, subject, body);
    window.open(mailto, "_blank");
    setSent(true);
    setEmail("");
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-xl font-bold text-[var(--ribera-navy)]">Crear nuevo usuario</h2>
      <p className="mb-4 text-sm text-gray-600">
        Seleccione el perfil del nuevo usuario y el correo electrónico al que enviar la invitación. Se abrirá su cliente de correo con el mensaje preparado.
      </p>

      <div className="flex flex-col gap-4 max-w-md">
        <label>
          <span className="block text-sm font-medium text-gray-700 mb-1">Perfil del nuevo usuario</span>
          <select
            value={profile}
            onChange={(e) => setProfile(e.target.value as UserRole)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {ROLES_FOR_INVITE.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="block text-sm font-medium text-gray-700 mb-1">Correo electrónico</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="correo@ejemplo.com"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleEnviar}
            disabled={!email.trim()}
            className="rounded-lg bg-[var(--ribera-red)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:enabled:opacity-90"
          >
            Enviar invitación por correo
          </button>
        </div>
        {sent && (
          <p className="text-sm text-green-700">
            Se ha abierto el cliente de correo. Complete el envío desde allí.
          </p>
        )}
      </div>
    </section>
  );
}
