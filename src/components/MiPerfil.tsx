"use client";

/**
 * Mi perfil: igual para cirujano, endoscopista, anestesista y gestor.
 * Foto, nombre, apellidos, correo, teléfono, especialidad.
 * Cambio de contraseña solo cuando modoDemo=false.
 */

import { useState, useEffect, useRef } from "react";
import type { User } from "@/lib/types";
import { getProfile, setProfile } from "@/lib/storagePerfiles";
import { isValidEmail } from "@/lib/validation";
import { validatePasswordStrength } from "@/lib/auth/passwordValidation";
import { modoDemo } from "@/lib/config";

interface MiPerfilProps {
  user: User;
  onSaved?: () => void;
}

export function MiPerfil({ user, onSaved }: MiPerfilProps) {
  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [especialidad, setEspecialidad] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  useEffect(() => {
    const p = getProfile(user.id);
    if (p) {
      setPhotoDataUrl(p.photoDataUrl ?? "");
      setNombre(p.nombre ?? "");
      setApellidos(p.apellidos ?? "");
      setEmail(p.email ?? "");
      setTelefono(p.telefono ?? "");
      setEspecialidad(p.especialidad ?? "");
    } else {
      const parts = (user.name ?? "").trim().split(/\s+/);
      setNombre(parts[0] ?? "");
      setApellidos(parts.slice(1).join(" ") ?? "");
      setEmail(user.email ?? "");
    }
  }, [user.id, user.name, user.email]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    const emailTrim = email.trim();
    if (emailTrim && !isValidEmail(emailTrim)) {
      setProfileError("Correo no válido.");
      return;
    }
    setSaving(true);
    setProfile({
      userId: user.id,
      photoDataUrl: photoDataUrl || undefined,
      nombre: nombre.trim(),
      apellidos: apellidos.trim(),
      email: emailTrim,
      telefono: telefono.trim(),
      especialidad: especialidad.trim(),
      completedAt: new Date().toISOString(),
    });
    setSaved(true);
    setSaving(false);
    onSaved?.();
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (!newPassword.trim()) {
      setPasswordError("La nueva contraseña es obligatoria.");
      return;
    }
    const pwdValidation = validatePasswordStrength(newPassword);
    if (!pwdValidation.valid) {
      setPasswordError(pwdValidation.error ?? "Contraseña no válida.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("La nueva contraseña y la confirmación no coinciden.");
      return;
    }
    if (!currentPassword) {
      setPasswordError("La contraseña actual es obligatoria.");
      return;
    }

    setPasswordSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        setPasswordError(data.error ?? "Error al cambiar la contraseña.");
        return;
      }

      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setPasswordError("Error de conexión. Inténtelo de nuevo.");
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-xl font-bold text-[var(--ribera-navy)]">Mi perfil</h2>
      <p className="mb-4 text-sm text-gray-600">
        Puede completar o modificar estos datos cuando quiera. Ningún campo es obligatorio.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex flex-col items-center">
            <div className="relative h-28 w-28 overflow-hidden rounded-full border-2 border-gray-200 bg-gray-100">
              {photoDataUrl ? (
                <img src={photoDataUrl} alt="Foto" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-4xl text-gray-400">?</div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 text-sm font-medium text-[var(--ribera-red)] hover:underline"
            >
              Subir foto
            </button>
          </div>
          <div className="flex-1 space-y-4">
            <label className="block">
              <span className="block text-sm font-medium text-gray-700">Nombre</span>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-gray-700">Apellidos</span>
              <input
                type="text"
                value={apellidos}
                onChange={(e) => setApellidos(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-gray-700">Correo electrónico</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-gray-700">Teléfono de contacto</span>
              <input
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-gray-700">Especialidad</span>
              <input
                type="text"
                value={especialidad}
                onChange={(e) => setEspecialidad(e.target.value)}
                placeholder="Ej. Traumatología, Cirugía general, Anestesiología..."
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              />
            </label>
          </div>
        </div>
        {profileError && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{profileError}</p>}
        {saved && <p className="rounded-lg bg-green-50 p-2 text-sm text-green-800">Perfil guardado correctamente.</p>}
        <button type="submit" disabled={saving} className="btn-ribera-primary disabled:cursor-not-allowed disabled:opacity-60">
          {saving ? "Guardando…" : "Guardar perfil"}
        </button>
      </form>

      {!modoDemo && (
        <section className="mt-8 border-t border-gray-200 pt-6">
          <h3 className="mb-3 text-lg font-semibold text-[var(--ribera-navy)]">Cambiar contraseña</h3>
          <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
            <label className="block">
              <span className="block text-sm font-medium text-gray-700">Contraseña actual</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                autoComplete="current-password"
                disabled={passwordSaving}
              />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-gray-700">Nueva contraseña</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                autoComplete="new-password"
                disabled={passwordSaving}
                minLength={8}
              />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-gray-700">Confirmar nueva contraseña</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                autoComplete="new-password"
                disabled={passwordSaving}
              />
            </label>
            {passwordError && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{passwordError}</p>}
            {passwordSuccess && <p className="rounded-lg bg-green-50 p-2 text-sm text-green-800">Contraseña cambiada correctamente.</p>}
            <button
              type="submit"
              disabled={passwordSaving}
              className="rounded-lg bg-[var(--ribera-navy)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--ribera-navy)]/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {passwordSaving ? "Guardando…" : "Cambiar contraseña"}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
