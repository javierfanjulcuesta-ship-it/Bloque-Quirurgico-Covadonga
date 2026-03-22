"use client";

/**
 * Pestaña del gestor: crear nuevo usuario.
 * Crea el usuario en la BD y envía la invitación (SMTP/Graph).
 * Si el servicio de correo no está disponible, abre mailto como fallback.
 * La lista de usuarios está en la pestaña "Gestión de usuarios".
 */

import { useState } from "react";
import { getEmailSubject, getEmailBody, buildMailtoLink } from "@/lib/emailsNuevoUsuario";
import { roleLabel } from "@/lib/types";
import type { UserRole } from "@/lib/types";
import { isValidEmail } from "@/lib/validation";
import { useUsers } from "@/context/UsersContext";

const ROLES_FOR_INVITE: UserRole[] = ["anestesista", "gestor", "gestor-anestesista", "cirujano", "endoscopista"];

const SESPA_ROLES: UserRole[] = ["anestesista", "gestor-anestesista"];

export function CrearNuevoUsuario() {
  const [profile, setProfile] = useState<UserRole>("cirujano");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [canSespa, setCanSespa] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { refresh } = useUsers();

  const handleEnviar = async () => {
    setError("");
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("Indique el correo electrónico.");
      return;
    }
    if (!isValidEmail(trimmed)) {
      setError("Correo no válido.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email: trimmed,
          role: profile,
          name: name.trim() || undefined,
          canSespa: SESPA_ROLES.includes(profile) ? canSespa : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error ?? "Error al crear usuario";
        setError(
          res.status === 409 && msg.includes("email")
            ? "Ya existe un usuario con ese correo. Puede reactivar la cuenta o reenviar la invitación desde Gestión de usuarios."
            : msg
        );
        return;
      }
      const { tempPassword } = data;
      const accessLink = typeof window !== "undefined" ? window.location.origin : "";
      const recipientName = name.trim() || undefined;

      try {
        const emailRes = await fetch("/api/email/send-invitation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            toEmail: trimmed,
            role: profile,
            recipientName,
            accessLink,
            initialPassword: tempPassword,
          }),
        });
        if (emailRes.ok) {
          setSent(true);
          setEmail("");
          setName("");
          refresh();
          return;
        }
        if (emailRes.status === 503) {
          const errData = await emailRes.json().catch(() => ({}));
          setError(
            (errData as { error?: string }).error ??
              "Configure NEXT_PUBLIC_APP_URL en Vercel para enviar invitaciones automáticas. Como alternativa, se abrirá su cliente de correo."
          );
          setLoading(false);
          return;
        }
      } catch {
        /* fallback a mailto */
      }

      const subject = getEmailSubject(profile);
      const body = getEmailBody(profile, { accessLink, initialPassword: tempPassword });
      const mailto = buildMailtoLink(trimmed, subject, body);
      window.open(mailto, "_blank");
      setSent(true);
      setEmail("");
      setName("");
      refresh();
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <div>
          <h2 className="mb-4 text-xl font-bold text-[var(--ribera-navy)]">Crear nuevo usuario</h2>
          <p className="mb-4 text-sm text-gray-600">
            Seleccione el perfil, correo y nombre. Se creará el usuario en el sistema y se abrirá su cliente de correo con la invitación y la contraseña temporal.
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
        <label>
          <span className="block text-sm font-medium text-gray-700 mb-1">Nombre (opcional)</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Se genera desde el correo si se deja vacío"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        {SESPA_ROLES.includes(profile) && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={canSespa}
              onChange={(e) => setCanSespa(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Puede anestesiar pacientes SESPA</span>
          </label>
        )}
        <div className="flex flex-col gap-2">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="button"
            onClick={handleEnviar}
            disabled={!email.trim() || loading}
            className="rounded-lg bg-[var(--ribera-red)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:enabled:opacity-90"
          >
            {loading ? "Creando usuario…" : "Crear usuario y enviar invitación"}
          </button>
        </div>
        {sent && (
          <p className="text-sm text-green-700">
            Usuario creado. La invitación se ha enviado desde el buzón de coordinación (o se ha abierto su cliente de correo como alternativa).
          </p>
        )}
          </div>
      </div>
    </section>
  );
}
