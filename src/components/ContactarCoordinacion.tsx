"use client";

/**
 * Pestaña para que cualquier perfil envíe un mensaje a todos los gestores (coordinación).
 */

import { useState } from "react";
import type { User } from "@/lib/types";
import { hasGestorAccess } from "@/lib/types";
import { getUsers } from "@/lib/dataHelpers";
import { getProfile } from "@/lib/storagePerfiles";
import { addMessageToGestor, addNotification } from "@/lib/storageMensajesYNotificaciones";

interface ContactarCoordinacionProps {
  user: User;
}

export function ContactarCoordinacion({ user }: ContactarCoordinacionProps) {
  const [contactSubject, setContactSubject] = useState("");
  const [contactBody, setContactBody] = useState("");
  const [contactSent, setContactSent] = useState(false);
  const [openedMail, setOpenedMail] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setContactError(null);
    const subject = contactSubject.trim() || "Mensaje desde la aplicación – Bloque Quirúrgico";
    const body = contactBody.trim();
    if (!body) {
      setContactError("Escriba el mensaje.");
      return;
    }
    addMessageToGestor({
      fromUserId: user.id,
      fromName: user.name,
      fromEmail: user.email,
      subject,
      body,
    });
    const gestores = getUsers().filter((u) => hasGestorAccess(u.role));
    gestores.forEach((g) => {
      addNotification({
        userId: g.id,
        title: "Nuevo mensaje",
        message: `${user.name} ha enviado un mensaje: ${subject}`,
      });
    });
    const gestorEmails = gestores
      .map((g) => (getProfile(g.id)?.email ?? g.email)?.trim())
      .filter((e): e is string => !!e && e.includes("@"));
    let openedMail = false;
    if (gestorEmails.length > 0) {
      const emailBody = `Mensaje enviado desde la aplicación Bloque Quirúrgico – Hospital Covadonga

Remitente: ${user.name}${user.email ? ` (${user.email})` : ""}
Asunto: ${subject}

---
${body}`;
      const mailto = `mailto:${gestorEmails.join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
      window.open(mailto, "_blank");
      openedMail = true;
    }
    setContactSent(true);
    setOpenedMail(openedMail);
    setContactSubject("");
    setContactBody("");
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-xl font-bold text-[var(--ribera-navy)]">Contactar a la coordinación</h2>
      <p className="mb-4 text-sm text-gray-600">
        Envíe un mensaje a todos los gestores del bloque quirúrgico. Recibirán una notificación en la aplicación.
      </p>
      {contactSent ? (
        <div className="rounded-lg bg-green-50 p-4 text-green-800">
          <p className="font-medium">Mensaje enviado correctamente.</p>
          <p className="mt-1 text-sm">
            {openedMail
              ? "Los gestores han recibido una notificación en la aplicación y se ha abierto su cliente de correo con las direcciones de correo del perfil de cada gestor."
              : "Los gestores han recibido una notificación en la aplicación."}
          </p>
          {openedMail && (
            <p className="mt-2 text-sm">Complete el envío del correo desde su cliente de correo.</p>
          )}
          <button type="button" onClick={() => { setContactSent(false); setOpenedMail(false); }} className="mt-2 text-sm font-medium text-[var(--ribera-red)] hover:underline">
            Enviar otro mensaje
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="max-w-xl space-y-4">
          <label className="block">
            <span className="block text-sm font-medium text-gray-700">Asunto</span>
            <input
              type="text"
              value={contactSubject}
              onChange={(e) => setContactSubject(e.target.value)}
              placeholder="Ej. Consulta sobre disponibilidad, incidencia..."
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-gray-700">Mensaje *</span>
            <textarea
              value={contactBody}
              onChange={(e) => setContactBody(e.target.value)}
              rows={4}
              placeholder="Escriba su consulta o mensaje..."
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            />
          </label>
          {contactError && <p className="text-sm text-red-600">{contactError}</p>}
          <button type="submit" className="btn-ribera-primary">Enviar a los gestores</button>
        </form>
      )}
    </div>
  );
}
