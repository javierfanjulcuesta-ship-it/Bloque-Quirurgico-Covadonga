"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { modoDemo } from "@/lib/config";
import { hasGestionCitasAccess } from "@/lib/types";
import { getDemoGestionCitasState, type DemoGestionCitasState } from "@/lib/demoGestionCitasState";
import { getReservations } from "@/lib/reservations";
import { getUsers } from "@/lib/dataHelpers";
import { addNotification } from "@/lib/storageMensajesYNotificaciones";
import { addResponsibleSurgeonInAppNotification } from "@/lib/notifications/responsibleSurgeonInApp";
import { addDemoOutgoingMail } from "@/lib/demoOutgoingMail";

function surgeryLabel(date: string, shift: "morning" | "afternoon"): string {
  const day = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
  return `${day} · ${shift === "morning" ? "mañana" : "tarde"}`;
}

async function mirrorAuthorizationDenied(patientId: string): Promise<void> {
  const reservations = await getReservations();
  for (const reservation of reservations) {
    const patient = reservation.patients?.find((candidate) => candidate.id === patientId);
    if (!patient) continue;

    const surgeon = getUsers().find((candidate) => candidate.id === reservation.surgeonId);
    const patientLabel = patient.name?.trim() || patient.numeroHistoria;
    const surgery = surgeryLabel(reservation.date, reservation.shift);
    const message = `${patientLabel} · ${surgery} · ${patient.procedure}. La autorización de la entidad financiadora figura como DENEGADA.`;

    addResponsibleSurgeonInAppNotification(
      {
        responsibleUserId: reservation.surgeonId,
        title: "Autorización denegada",
        message,
      },
      addNotification,
    );

    addDemoOutgoingMail({
      category: "AUTORIZACION_DENEGADA",
      recipientLabel: surgeon?.email?.trim() || `${surgeon?.name ?? "Cirujano responsable"} · correo no disponible en DEMO`,
      subject: `[QxFlow][AUTORIZACIÓN DENEGADA] ${patientLabel} · ${reservation.date}`,
      body: [
        "Se ha registrado una autorización DENEGADA para un paciente programado.",
        "",
        `Paciente: ${patientLabel}`,
        `Intervención: ${surgery}`,
        `Sala/recurso: ${reservation.resourceId}`,
        `Procedimiento: ${patient.procedure}`,
        `Profesional responsable: ${surgeon?.name ?? "No disponible"}`,
        "Estado de autorización: DENEGADA",
        "",
        "Acción: revisar la incidencia antes de la intervención.",
      ].join("\n"),
    });
    return;
  }
}

/**
 * The Gestión de citas DEMO layout owns cross-workflow demo-only side effects.
 * This keeps the worklist focused on operational edits while the layout observes
 * authorization transitions and mirrors them to the responsible surgeon channels.
 */
export default function GestionCitasLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, hydrated } = useAuth();
  const previousRef = useRef<DemoGestionCitasState | null>(null);
  const processingRef = useRef(new Set<string>());

  useEffect(() => {
    if (!hydrated || !user || !hasGestionCitasAccess(user.role) || !modoDemo) {
      previousRef.current = null;
      return;
    }

    const inspect = () => {
      const current = getDemoGestionCitasState();
      const previous = previousRef.current;
      previousRef.current = current;
      if (!previous) return;

      for (const [patientId, state] of Object.entries(current)) {
        const before = previous[patientId]?.authorizationStatus;
        const after = state.authorizationStatus;
        if (before === "DENEGADA" || after !== "DENEGADA" || processingRef.current.has(patientId)) continue;

        processingRef.current.add(patientId);
        void mirrorAuthorizationDenied(patientId)
          .catch(() => {
            // DEMO only: no external side effect is retried or promoted to a real send.
          })
          .finally(() => processingRef.current.delete(patientId));
      }
    };

    inspect();
    const timer = window.setInterval(inspect, 700);
    window.addEventListener("focus", inspect);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", inspect);
    };
  }, [hydrated, user]);

  const showMailboxButton = hydrated
    && !!user
    && hasGestionCitasAccess(user.role)
    && modoDemo
    && pathname !== "/gestion-citas/correo-simulado";

  return (
    <>
      {children}
      {showMailboxButton ? (
        <button
          type="button"
          onClick={() => router.push("/gestion-citas/correo-simulado")}
          className="fixed bottom-5 right-5 z-40 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-[var(--ribera-navy)] shadow-lg hover:bg-slate-50"
        >
          🧪 Correo simulado
        </button>
      ) : null}
    </>
  );
}
