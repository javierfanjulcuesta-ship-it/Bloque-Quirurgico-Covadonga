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
import { InlineNotice } from "@/components/ui/InlineNotice";

const ROLES_FOR_INVITE: UserRole[] = ["anestesista", "gestor", "gestor-anestesista", "cirujano", "endoscopista"];

const SESPA_ROLES: UserRole[] = ["anestesista", "gestor-anestesista"];

export function CrearNuevoUsuario() {
  const [profile, setProfile] = useState<UserRole>("cirujano");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [canSespa, setCanSespa] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; tempPassword: string; role: UserRole } | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const { refresh } = useUsers();

  const copyCredentials = async (value: { email: string; tempPassword: string; role: UserRole }) => {
    const text = `Email: ${value.email}\nContraseña temporal: ${value.tempPassword}\nRol: ${roleLabel(value.role)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("Credenciales copiadas al portapapeles.");
    } catch {
      setCopyStatus("No se pudieron copiar automáticamente. Puede seleccionar y copiar manualmente.");
    }
    setTimeout(() => setCopyStatus(""), 2500);
  };

  const handleEnviar = async () => {
    setError("");
    setWarning("");
    setSuccess("");
    setCopyStatus("");
    setCreatedCredentials(null);
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
      const credentials = { email: trimmed, tempPassword, role: profile };
      setCreatedCredentials(credentials);
      setSuccess("Usuario creado correctamente. Puede acceder inmediatamente con estas credenciales.");
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
        setCreatedCredentials(credentials);
        setWarning(
          emailRes.status === 503
            ? "El usuario está creado, pero no se pudo enviar el correo de invitación. Puede entregar estas credenciales manualmente."
            : `El usuario está creado, pero falló el envío del correo: ${msg}. Puede entregar estas credenciales manualmente.`
        );
        return;
      }

      setWarning("");
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
            Seleccione el perfil, correo y nombre. El usuario se crea al instante y verá credenciales para acceso inmediato.
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
          {success && <InlineNotice variant="success">{success}</InlineNotice>}
          {warning && <InlineNotice variant="warning">{warning}</InlineNotice>}
          {error && <InlineNotice variant="error">{error}</InlineNotice>}
          {createdCredentials && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-800">Credenciales de acceso</p>
              <div className="space-y-1 text-sm text-slate-700">
                <p>
                  <span className="font-medium">Email:</span>{" "}
                  <span className="select-all font-mono">{createdCredentials.email}</span>
                </p>
                <p>
                  <span className="font-medium">Contraseña temporal:</span>{" "}
                  <span className="select-all font-mono">{createdCredentials.tempPassword}</span>
                </p>
                <p>
                  <span className="font-medium">Rol:</span> {roleLabel(createdCredentials.role)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => copyCredentials(createdCredentials)}
                className="btn-ribera-secondary mt-3 px-3 py-2 text-sm"
              >
                Copiar credenciales
              </button>
              {copyStatus && <p className="mt-2 text-xs text-slate-600">{copyStatus}</p>}
            </div>
          )}
          <button
            type="button"
            onClick={handleEnviar}
            disabled={!email.trim() || loading}
            className="rounded-lg bg-[var(--ribera-red)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:enabled:opacity-90"
          >
            {loading ? "Creando usuario…" : "Crear usuario y enviar invitación"}
          </button>
        </div>
          </div>
      </div>
    </section>
  );
}
