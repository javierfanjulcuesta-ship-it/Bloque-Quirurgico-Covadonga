/**
 * POST /api/cron/release-pending-reservations
 * Libera reservas PENDING sin pacientes cuya semana objetivo ya pasó el cierre configurado.
 *
 * La consulta inicial solo obtiene candidatos. Cada liberación se revalida bajo el
 * mismo lock PostgreSQL que usan las mutaciones de reserva/paciente, evitando que
 * el cron libere un tramo al que se acaba de añadir un paciente.
 *
 * Requiere Authorization: Bearer <CRON_SECRET> cuando CRON_SECRET está definido.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { logReservationEvent } from "@/lib/reservations/logReservationEvent";
import { isReservationRetentionStillAllowed } from "@/lib/schedulingDeadline";
import {
  releasePendingReservationIfEligible,
  type PendingReleaseCandidate,
} from "@/lib/reservations/releasePendingReservationIfEligible";
import { sendReleaseNotificationToSurgeons } from "@/lib/email/outlookService";

export async function POST() {
  try {
    const secret = process.env.CRON_SECRET;
    if (process.env.NODE_ENV === "production" && !secret) {
      return NextResponse.json({ error: "CRON_SECRET no configurado en producción" }, { status: 503 });
    }
    const authHeader = (await headers()).get("authorization");
    if (secret && authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Lectura optimista para reducir trabajo. NO autoriza por sí sola la liberación.
    const pending = await prisma.reservation.findMany({
      where: {
        status: "PENDING",
        patients: { none: {} },
      },
      select: { id: true, date: true, resourceId: true, shift: true, slotIndex: true, surgeonId: true },
    });

    const candidates: PendingReleaseCandidate[] = pending.filter((r) => {
      const dateStr = r.date.toISOString().slice(0, 10);
      return !isReservationRetentionStillAllowed(dateStr);
    });

    if (candidates.length === 0) {
      return NextResponse.json({ ok: true, released: 0, notification: "skipped" });
    }

    const actuallyReleased: PendingReleaseCandidate[] = [];
    for (const candidate of candidates) {
      const result = await releasePendingReservationIfEligible(candidate);
      if (!result.released) continue;

      actuallyReleased.push(result.reservation);
      await logReservationEvent({
        eventType: "RESERVATION_RELEASED",
        reservationId: result.reservation.id,
        actorUserId: null,
        origin: "app",
        detailsJson: {
          trigger: "cron_deadline",
          date: result.reservation.date.toISOString().slice(0, 10),
          resourceId: result.reservation.resourceId,
          shift: result.reservation.shift,
          slotIndex: result.reservation.slotIndex,
        },
      });
    }

    if (actuallyReleased.length === 0) {
      return NextResponse.json({ ok: true, released: 0, notification: "skipped_after_revalidation" });
    }

    const slotDetails = actuallyReleased.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      shift: r.shift === "MORNING" ? "morning" : "afternoon",
      resourceId: r.resourceId,
    }));

    const cirujanos = await prisma.user.findMany({
      where: { role: "CIRUJANO", approved: true, deletedAt: null },
      select: { email: true },
    });
    const recipientEmails = cirujanos
      .map((u) => u.email?.trim())
      .filter((e): e is string => !!e && e.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

    let emailStatus: "SENT" | "FAILED" | "SKIPPED" = "SKIPPED";
    let errorMessage: string | null = null;
    let recipientCount = 0;

    if (recipientEmails.length > 0) {
      const result = await sendReleaseNotificationToSurgeons(slotDetails, recipientEmails);
      recipientCount = result.sent + result.failed;
      if (result.failed > 0) {
        emailStatus = "FAILED";
        errorMessage = result.errors.join("; ");
      } else {
        emailStatus = "SENT";
      }
    }

    await prisma.releaseNotificationLog.create({
      data: {
        releasedCount: actuallyReleased.length,
        slotDetailsJson: JSON.stringify(slotDetails),
        releasedReservationIds: JSON.stringify(actuallyReleased.map((r) => r.id)),
        recipientCount,
        emailStatus,
        errorMessage,
      },
    });

    await logReservationEvent({
      eventType: "AUTO_RELEASE_TO_COMMON_POOL",
      reservationId: null,
      actorUserId: null,
      origin: "app",
      detailsJson: {
        releasedCount: actuallyReleased.length,
        candidateCount: candidates.length,
        recipientCount,
        emailStatus,
        slotDetails,
      },
    });

    return NextResponse.json({
      ok: true,
      released: actuallyReleased.length,
      candidates: candidates.length,
      notification: { status: emailStatus, recipients: recipientCount },
    });
  } catch (err) {
    console.error("[cron release-pending-reservations]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
