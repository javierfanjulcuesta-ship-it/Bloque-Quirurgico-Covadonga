"use client";

/**
 * Mi perfil: igual para cirujano, endoscopista, anestesista y gestor.
 * Foto, nombre, apellidos, correo, teléfono y especialidad son opcionales.
 */

import { useState, useEffect, useRef } from "react";
import type { User } from "@/lib/types";
import { getProfile, setProfile } from "@/lib/storagePerfiles";

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setProfile({
      userId: user.id,
      photoDataUrl: photoDataUrl || undefined,
      nombre: nombre.trim(),
      apellidos: apellidos.trim(),
      email: email.trim(),
      telefono: telefono.trim(),
      especialidad: especialidad.trim(),
      completedAt: new Date().toISOString(),
    });
    setSaved(true);
    onSaved?.();
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
        {saved && <p className="rounded-lg bg-green-50 p-2 text-sm text-green-800">Perfil guardado correctamente.</p>}
        <button type="submit" className="btn-ribera-primary">
          Guardar perfil
        </button>
      </form>
    </div>
  );
}
