"use client";

/**
 * Pantalla de acceso.
 * DEMO: selección de usuario sin contraseña.
 * REAL: login con email + contraseña.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";
import { getUsers } from "@/lib/dataHelpers";
import { resetDemoStorage } from "@/lib/demoReset";
import { loadDemoSeed } from "@/lib/demoSeed";
import { addMessageToGestor, addNotification } from "@/lib/storageMensajesYNotificaciones";
import { hasGestorAccess } from "@/lib/types";
import { roleLabel } from "@/lib/types";
import type { User } from "@/lib/types";
import { isValidEmail } from "@/lib/validation";
import { modoDemo } from "@/lib/config";
import { InlineNotice } from "@/components/ui/InlineNotice";

export default function HomePage() {
  const router = useRouter();
  const { user: authUser, login, logout, loginWithPassword } = useAuth();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactSubject, setContactSubject] = useState("");
  const [contactBody, setContactBody] = useState("");
  const [contactSent, setContactSent] = useState(false);
  const [contactError, setContactError] = useState("");
  const [loadExampleSuccess, setLoadExampleSuccess] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const demoUsers = getUsers();
  const hasNoDemoUsers = demoUsers.length === 0;

  useEffect(() => {
    if (!authUser || !router) return;
    const r = authUser.role;
    if (r === "cirujano" || r === "endoscopista") router.replace("/cirujano");
    else router.replace("/calendario");
  }, [authUser, router]);

  const goToPanel = () => {
    if (!authUser) return;
    if (authUser.role === "cirujano" || authUser.role === "endoscopista") router.replace("/cirujano");
    else router.replace("/calendario");
  };

  const roleWorkspaceHint = authUser
    ? authUser.role === "cirujano" || authUser.role === "endoscopista"
      ? "Entrará en su espacio de programación quirúrgica."
      : hasGestorAccess(authUser.role)
        ? "Entrará en el espacio de coordinación del bloque (calendario global)."
        : "Entrará en su espacio de programación y consulta anestésica."
    : "";

  const handleEnterDemo = () => {
    if (!selectedUser) return;
    login(selectedUser);
    if (selectedUser.role === "cirujano" || selectedUser.role === "endoscopista") router.replace("/cirujano");
    else router.replace("/calendario");
  };

  const handleRestablecerDemo = () => {
    resetDemoStorage();
    logout();
    setSelectedUser(null);
    setLoadExampleSuccess(false);
    router.replace("/");
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    const result = await loginWithPassword(loginEmail.trim(), loginPassword);
    setLoginLoading(false);
    if (result.ok && result.user) {
      const dest = result.user.role === "cirujano" || result.user.role === "endoscopista" ? "/cirujano" : "/calendario";
      router.replace(dest);
    } else {
      setLoginError(result.error ?? "Error al iniciar sesión");
    }
  };

  const handleLoadExample = () => {
    loadDemoSeed();
    setLoadExampleSuccess(true);
    setTimeout(() => setLoadExampleSuccess(false), 6000);
  };

  const noUserSelected = !selectedUser || hasNoDemoUsers;

  const handleContactSubmit = async (e: React.FormEvent) => {
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
    if (!isValidEmail(emailVal)) {
      setContactError("Correo no válido.");
      return;
    }
    if (!body) {
      setContactError("Describa su consulta o problema.");
      return;
    }
    const subject = contactSubject.trim() || "Mensaje de usuario sin acceso – Bloque Quirúrgico";

    if (modoDemo) {
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
    } else {
      try {
        const res = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromName: name,
            fromEmail: emailVal,
            subject,
            body,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setContactError((data as { error?: string }).error ?? "Error al enviar");
          return;
        }
      } catch {
        setContactError("Error de conexión");
        return;
      }
    }
    setContactSent(true);
    setContactName("");
    setContactEmail("");
    setContactSubject("");
    setContactBody("");
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-xl flex-col justify-center px-4 py-10">
      <div className="mb-6 mt-2 flex justify-center sm:mb-8 sm:mt-4">
        <Image
          src="/qxflow-logo.png"
          alt="QxFlow"
          width={220}
          height={70}
          priority
          className="h-auto w-[180px] sm:w-[220px]"
        />
      </div>
      {authUser && (
        <div className="mb-4 w-full rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center lg:text-left">
          <p className="text-sm font-medium text-green-800">
            Sesión iniciada como <strong>{authUser.name}</strong>.
          </p>
          <p className="mt-1 text-xs text-green-700">{roleWorkspaceHint}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2 lg:justify-start">
            <button type="button" onClick={goToPanel} className="btn-ribera-primary">
              Ir al panel
            </button>
            <button
              type="button"
              onClick={() => { logout(); setSelectedUser(null); }}
              className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cerrar sesión
            </button>
            {modoDemo && (
            <button
              type="button"
              onClick={handleRestablecerDemo}
              className="rounded border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
            >
              Restablecer demo
            </button>
          )}
          </div>
        </div>
      )}
      <div className="card-ribera w-full p-8">
        {modoDemo && (
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--ribera-red)]">Modo demo</p>
        )}
        <h2 className="mb-4 text-xl font-semibold tracking-tight text-[var(--ribera-navy)]">
          {modoDemo ? "Acceso de demostración" : "Iniciar sesión"}
        </h2>
        {modoDemo ? (
          <>
        <p className="mb-4 text-sm text-gray-600">Seleccione un perfil y pulse <strong>Entrar en modo DEMO</strong>. Sin contraseñas.</p>
        {hasNoDemoUsers && (
          <InlineNotice variant="warning" className="mb-4">
            No hay usuarios demo disponibles. Compruebe la configuración de la aplicación.
          </InlineNotice>
        )}
        <div className="space-y-2">
          {demoUsers.map((u) => (
            <label
              key={u.id}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-3 transition-colors ${
                selectedUser?.id === u.id ? "border-[var(--ribera-red)] bg-red-50/30" : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="demoUser"
                checked={selectedUser?.id === u.id}
                onChange={() => setSelectedUser(u)}
                className="h-4 w-4 border-gray-300 text-[var(--ribera-red)] focus:ring-[var(--ribera-red)]"
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900">{u.name}</p>
                <p className="text-sm text-gray-500">{u.email} · {roleLabel(u.role)}</p>
              </div>
            </label>
          ))}
        </div>
        {noUserSelected && (
          <p className="mt-3 text-center text-sm text-amber-700" role="status">
            Seleccione un usuario de la lista para poder entrar.
          </p>
        )}
        <button
          type="button"
          onClick={handleEnterDemo}
          disabled={noUserSelected}
          className="btn-ribera-primary mt-4 w-full py-3 disabled:cursor-not-allowed disabled:opacity-50"
          aria-disabled={noUserSelected}
        >
          Entrar en modo DEMO
        </button>
        <p className="mt-6 text-center text-xs text-gray-400">
          Si no tiene acceso,{" "}
          <button
            type="button"
            onClick={() => setContactModalOpen(true)}
            className="font-medium text-[var(--ribera-red)] hover:underline"
          >
            envíe un mensaje aquí
          </button>
          .
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-4 text-center">
          <button
            type="button"
            onClick={handleLoadExample}
            className="text-xs font-medium text-[var(--ribera-navy)] hover:underline"
          >
            Cargar datos de ejemplo
          </button>
          <span className="text-xs text-gray-400">·</span>
          <button
            type="button"
            onClick={handleRestablecerDemo}
            className="text-xs font-medium text-gray-500 hover:text-gray-700 underline"
          >
            Restablecer demo
          </button>
        </div>
        {loadExampleSuccess && (
          <InlineNotice variant="success" className="mt-3 text-center" role="status">
            Datos de ejemplo cargados. Seleccione un usuario y pulse Entrar en modo DEMO para verlos.
          </InlineNotice>
        )}
          </>
        ) : (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <p className="mb-4 text-sm text-gray-600">Introduzca sus credenciales para continuar.</p>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Email</span>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
                autoComplete="email"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Contraseña</span>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
                autoComplete="current-password"
              />
            </label>
            {loginError && (
              <InlineNotice variant="error" role="alert">{loginError}</InlineNotice>
            )}
            <button
              type="submit"
              disabled={loginLoading}
              className="btn-ribera-primary w-full py-3 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loginLoading ? "Iniciando sesión…" : "Iniciar sesión"}
            </button>
            <p className="mt-4 text-center text-sm text-gray-500">
              Si no dispone de acceso, contacte con la coordinación del bloque quirúrgico.
            </p>
          </form>
        )}
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
            <h2 className="mb-2 text-lg font-bold text-[var(--ribera-navy)]">Contactar con coordinación</h2>
            <p className="mb-4 text-sm text-gray-600">
              El mensaje llegará a los gestores del bloque quirúrgico.
            </p>
            {contactSent ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
                <p className="font-medium">Mensaje enviado correctamente.</p>
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
                {contactError && <InlineNotice variant="error">{contactError}</InlineNotice>}
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
