"use client";

/**
 * Pestaña del gestor: crear nuevo usuario.
 * Crea el usuario en la BD y envía la invitación por email REAL (SMTP/Graph).
 * Sin mailto: si el envío falla, se muestra error claro.
 */

import { useState } from "react";
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
  const [warning, setWarning] = useState("");
  const [loading, setLoading] = useState(false);
  /** Si el alta en BD fue OK pero falló el email: el gestor debe poder copiar la contraseña temporal aquí. */
  const [manualCredentials, setManualCredentials] = useState<{ email: string; tempPassword: string } | null>(null);
  const { refresh } = useUsers();

  const handleEnviar = async () => {
    setError("");
    setWarning("");
    setManualCredentials(null);
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
        console.log("[FRONT] ERROR CREAR USUARIO", data);
        const msg = data.error || "Error desconocido";
        setError(
          res.status === 409 && msg.toLowerCase().includes("email")
            ? "Ya existe un usuario con ese correo. Puede reactivar la cuenta o reenviar la invitación desde Gestión de usuarios."
            : msg
        );
        return;
      }
      const tempPassword = typeof data.tempPassword === "string" ? data.tempPassword : "";
      if (!tempPassword) {
        setError("El usuario pudo crearse pero el servidor no devolvió contraseña temporal. Use «Regenerar contraseña» en Gestión de usuarios.");
        await refresh();
        return;
      }
      const accessLink = typeof window !== "undefined" ? window.location.origin : "";
      const recipientName = name.trim() || undefined;

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
      const emailData = await emailRes.json().catch(() => ({}));
      if (!emailRes.ok) {
        const msg = (emailData.error as string) ?? "No se pudo enviar el email";
        await refresh();
        setManualCredentials({ email: trimmed, tempPassword });
        setWarning(
          emailRes.status === 503
            ? "Usuario creado en la base de datos, pero no se pudo enviar el correo (revise NEXT_PUBLIC_APP_URL y SMTP). Copie la contraseña temporal abajo y entréguela al usuario para que pueda iniciar sesión."
            : `Usuario creado, pero falló el envío del correo: ${msg}. Copie la contraseña temporal abajo.`
        );
        return;
      }

      setSent(true);
      setWarning("");
      setManualCredentials(null);
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
            Seleccione el perfil, correo y nombre. Se creará el usuario en el sistema y se enviará un correo real con la invitación y la contraseña temporal.
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
          {manualCredentials && (
            <div
              className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm text-amber-950"
              role="status"
            >
              <p className="mb-2 font-semibold">Contraseña temporal (cópiela ahora)</p>
              <p className="mb-1 text-gray-800">
                <span className="text-gray-600">Correo:</span> {manualCredentials.email}
              </p>
              <p className="select-all font-mono text-base font-bold tracking-wider">{manualCredentials.tempPassword}</p>
            </div>
          )}
          {warning && <p className="text-sm font-medium text-amber-800">{warning}</p>}
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
            Usuario creado y email enviado correctamente.
          </p>
        )}
          </div>
      </div>
    </section>
  );
}
