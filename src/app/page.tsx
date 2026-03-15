"use client";

/**
 * Pantalla de acceso: correo (usuario) y contraseña.
 * "¿Se ha olvidado del usuario o contraseña?" genera una nueva contraseña.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getUsers, findUserByEmailOrUsername } from "@/lib/dataHelpers";
import {
  getPasswordForEmail,
  setPasswordForEmail,
  generateRandomPassword,
  ensureInitialGestorPassword,
} from "@/lib/passwords";
import { addMessageToGestor, addNotification } from "@/lib/storageMensajesYNotificaciones";
import { hasGestorAccess } from "@/lib/types";

export default function HomePage() {
  const router = useRouter();
  const { user: authUser, login, logout } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [newPasswordShown, setNewPasswordShown] = useState<string | null>(null);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactSubject, setContactSubject] = useState("");
  const [contactBody, setContactBody] = useState("");
  const [contactSent, setContactSent] = useState(false);
  const [contactError, setContactError] = useState("");

  useEffect(() => {
    ensureInitialGestorPassword();
  }, []);

  const goToPanel = () => {
    if (!authUser) return;
    if (authUser.role === "cirujano" || authUser.role === "endoscopista") router.replace("/cirujano");
    else router.replace("/calendario");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    ensureInitialGestorPassword();
    const trimmedInput = email.trim();
    if (!trimmedInput) {
      setError("Introduzca su correo electrónico o nombre de usuario.");
      return;
    }
    const users = getUsers();
    const user = findUserByEmailOrUsername(users, trimmedInput);
    if (!user) {
      setError("No se encuentra ningún usuario con ese correo o nombre. Contacte con el gestor.");
      return;
    }
    if (!user.approved) {
      setError("Su acceso aún no está activado. El gestor debe aprobarle.");
      return;
    }
    const storedPassword = getPasswordForEmail(user.email);
    if (password.trim() !== "" && storedPassword !== null && password.trim() !== storedPassword) {
      setError("Contraseña incorrecta. Si la ha olvidado, use la opción de recuperación o deje la contraseña en blanco.");
      return;
    }
    login(user);
    if (user.role === "cirujano" || user.role === "endoscopista") router.replace("/cirujano");
    else router.replace("/calendario");
  };

  const handleForgotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError("");
    setNewPasswordShown(null);
    const trimmed = forgotEmail.trim();
    if (!trimmed) {
      setForgotError("Introduzca su correo electrónico o nombre de usuario.");
      return;
    }
    const users = getUsers();
    const user = findUserByEmailOrUsername(users, trimmed);
    if (!user || !user.approved) {
      setForgotError("No existe ningún usuario con ese correo o nombre o aún no ha sido activado. Contacte con el gestor.");
      return;
    }
    const newPassword = generateRandomPassword();
    setPasswordForEmail(user.email, newPassword);
    setNewPasswordShown(newPassword);
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setContactError("");
    const name = contactName.trim();
    const emailVal = contactEmail.trim().toLowerCase();
    const body = contactBody.trim();
    if (!name) {
      setContactError("Indique su nombre y apellidos.");
      return;
    }
    if (!emailVal) {
      setContactError("Indique su correo electrónico para poder responderle.");
      return;
    }
    if (!body) {
      setContactError("Describa su consulta o problema.");
      return;
    }
    const subject = contactSubject.trim() || "Mensaje de usuario sin acceso – Bloque Quirúrgico";
    addMessageToGestor({
      fromUserId: "anon",
      fromName: name,
      fromEmail: emailVal,
      subject,
      body: `Contacto: ${emailVal}\n\n${body}`,
    });
    const gestores = getUsers().filter((u) => hasGestorAccess(u.role));
    gestores.forEach((g) => {
      addNotification({
        userId: g.id,
        title: "Nuevo mensaje de usuario sin acceso",
        message: `${name} ha enviado un mensaje desde la pantalla de acceso. Asunto: ${subject}. Revise la pestaña Mensajes.`,
      });
    });
    setContactSent(true);
    setContactName("");
    setContactEmail("");
    setContactSubject("");
    setContactBody("");
  };

  if (forgotMode) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4">
        <div className="card-ribera w-full max-w-md p-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--ribera-red)]">Grupo Ribera</p>
          <h1 className="mb-2 text-2xl font-bold tracking-tight text-[var(--ribera-navy)]">Bloque Quirúrgico Covadonga</h1>
          <p className="mb-6 text-gray-600">Recuperar acceso</p>
          <p className="mb-4 text-sm text-gray-500">
            Introduzca su <strong>correo electrónico</strong>. Si ya ha sido invitado al sistema, se generará una nueva contraseña asociada a ese correo.
          </p>
          {newPasswordShown ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-green-50 p-4 text-green-800">
                <p className="mb-2 font-medium">Se ha generado una nueva contraseña.</p>
                <p className="mb-2 text-sm">Utilícela junto con su correo electrónico para acceder:</p>
                <p className="rounded bg-white p-3 font-mono text-lg font-bold tracking-wider">{newPasswordShown}</p>
                <p className="mt-2 text-xs">
                  Le recomendamos anotarla. Podrá volver a generar otra desde &quot;Se ha olvidado del usuario o contraseña&quot; si la olvida.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setForgotMode(false);
                  setNewPasswordShown(null);
                  setForgotEmail("");
                }}
                className="w-full rounded-lg border-2 border-gray-200 bg-white py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-50"
              >
                Volver al acceso
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotSubmit} className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Correo electrónico</span>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="ejemplo@hospital.local"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-800 placeholder-gray-400 focus:border-[var(--ribera-red)] focus:outline-none focus:ring-1 focus:ring-[var(--ribera-red)]"
                  autoFocus
                />
              </label>
              {forgotError && (
                <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{forgotError}</p>
              )}
              <button
                type="submit"
                className="btn-ribera-primary w-full py-3"
              >
                Generar nueva contraseña
              </button>
              <button
                type="button"
                onClick={() => { setForgotMode(false); setForgotError(""); setForgotEmail(""); }}
                className="w-full rounded-lg border border-gray-300 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Volver al acceso
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center px-4" style={{ minHeight: "60vh" }}>
      {authUser && (
        <div className="mb-4 w-full max-w-md rounded-lg border border-green-200 bg-green-50 p-4 text-center">
          <p className="text-sm font-medium text-green-800">
            Tiene sesión iniciada como <strong>{authUser.name}</strong>.
          </p>
          <div className="mt-2 flex justify-center gap-3">
            <button type="button" onClick={goToPanel} className="btn-ribera-primary">
              Ir al panel
            </button>
            <button
              type="button"
              onClick={() => { logout(); }}
              className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
      <div className="card-ribera w-full max-w-md p-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--ribera-red)]">Grupo Ribera</p>
        <h1 className="mb-1 text-2xl font-bold tracking-tight text-[var(--ribera-navy)]">Bloque Quirúrgico Covadonga</h1>
        <p className="mb-6 text-sm text-gray-500">Acceso al sistema de gestión</p>
        <p className="mb-5 text-sm text-gray-600">
          El nombre de usuario es su <strong>correo electrónico</strong>. Si ha olvidado su contraseña, use el enlace inferior.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-[var(--ribera-navy)]">Correo electrónico</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="username email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ejemplo@hospital.local"
              className="w-full rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3 text-gray-800 placeholder-gray-400 transition-colors focus:border-[var(--ribera-red)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--ribera-red)]/20"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-[var(--ribera-navy)]">Contraseña</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Dejar en blanco si no tiene o para acceso rápido"
              className="w-full rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3 text-gray-800 placeholder-gray-400 transition-colors focus:border-[var(--ribera-red)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--ribera-red)]/20"
            />
          </label>
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{error}</p>
          )}
          <button type="submit" className="btn-ribera-primary w-full py-3">
            Entrar
          </button>
        </form>
        <p className="mt-5 text-center">
          <button
            type="button"
            onClick={() => setForgotMode(true)}
            className="text-sm font-medium text-[var(--ribera-red)] hover:underline"
          >
            ¿Se ha olvidado del usuario o contraseña?
          </button>
        </p>
        <p className="mt-4 text-center text-xs text-gray-400">
          Si no tiene acceso, póngase en contacto con el Hospital Ribera Covadonga o{" "}
          <button
            type="button"
            onClick={() => setContactModalOpen(true)}
            className="font-medium text-[var(--ribera-red)] hover:underline"
          >
            envíe un mensaje aquí
          </button>
          .
        </p>
      </div>

      {contactModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !contactSent && setContactModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-lg font-bold text-[var(--ribera-navy)]">Enviar mensaje al Hospital Ribera Covadonga</h2>
            <p className="mb-4 text-sm text-gray-600">
              Si no tiene acceso a la aplicación o tiene algún problema, indique quién es y describa su consulta. El mensaje llegará a los gestores del bloque quirúrgico.
            </p>
            {contactSent ? (
              <div className="rounded-lg bg-green-50 p-4 text-green-800">
                <p className="font-medium">Mensaje enviado correctamente.</p>
                <p className="mt-1 text-sm">Los gestores del bloque quirúrgico recibirán su mensaje.</p>
                <button
                  type="button"
                  onClick={() => { setContactSent(false); setContactModalOpen(false); }}
                  className="btn-ribera-primary mt-4"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <form onSubmit={handleContactSubmit} className="space-y-4">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Nombre y apellidos</span>
                  <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="¿Quién es?" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Correo electrónico</span>
                  <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Para poder responderle" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Asunto (opcional)</span>
                  <input type="text" value={contactSubject} onChange={(e) => setContactSubject(e.target.value)} placeholder="Ej. Solicitud de acceso" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">¿Qué desea comunicar?</span>
                  <textarea value={contactBody} onChange={(e) => setContactBody(e.target.value)} placeholder="Describa su consulta..." rows={4} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </label>
                {contactError && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{contactError}</p>}
                <div className="flex gap-2">
                  <button type="submit" className="btn-ribera-primary">Enviar mensaje</button>
                  <button type="button" onClick={() => setContactModalOpen(false)} className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
