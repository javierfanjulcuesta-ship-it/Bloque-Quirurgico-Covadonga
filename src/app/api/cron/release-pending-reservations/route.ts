/**
 * POST /api/cron/release-pending-reservations
 * Libera reservas PENDING sin pacientes cuya semana objetivo ya pasó el cierre (jueves 00:00).
 * Envía un correo agrupado a todos los CIRUJANO con los huecos liberados.
 * Idempotente: las reservas liberadas no se tocan en ejecuciones posteriores.
 * Requiere: Authorization: Bearer <CRON_SECRET> (si CRON_SECRET está definido)
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { logReservationEvent } from "@/lib/reservations/logReservationEvent";
import { isReservationRetentionStillAllowed } from "@/lib/utils";
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

    const pending = await prisma.reservation.findMany({
      where: {
        status: "PENDING",
        patients: { none: {} },
      },
      select: { id: true, date: true, resourceId: true, shift: true, slotIndex: true, surgeonId: true },
    });

    const toRelease = pending.filter((r) => {
      const dateStr = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);
      return !isReservationRetentionStillAllowed(dateStr);
    });

    if (toRelease.length === 0) {
      return NextResponse.json({ ok: true, released: 0, notification: "skipped" });
    }

    for (const r of toRelease) {
      await prisma.reservation.update({
        where: { id: r.id },
        data: {
          status: "RELEASED",
          releasedAt: new Date(),
          releaseReason: "cierre_automatico_programacion",
        },
      });
      await logReservationEvent({
        eventType: "RESERVATION_RELEASED",
        reservationId: r.id,
        actorUserId: null,
        origin: "app",
        detailsJson: {
          trigger: "cron_deadline",
          date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date,
          resourceId: r.resourceId,
          shift: r.shift,
          slotIndex: r.slotIndex,
        },
      });
    }

    const slotDetails = toRelease.map((r) => ({
      date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10),
      shift: r.shift === "MORNING" ? "morning" : "afternoon",
      resourceId: r.resourceId,
    }));

    const cirujanos = await prisma.user.findMany({
      where: { role: "CIRUJANO", approved: true },
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
        emailStatus = result.sent > 0 ? "FAILED" : "FAILED";
        errorMessage = result.errors.join("; ");
      } else {
        emailStatus = "SENT";
      }
    }

    await prisma.releaseNotificationLog.create({
      data: {
        releasedCount: toRelease.length,
        slotDetailsJson: JSON.stringify(slotDetails),
        releasedReservationIds: JSON.stringify(toRelease.map((r) => r.id)),
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
        releasedCount: toRelease.length,
        recipientCount,
        emailStatus,
        slotDetails,
      },
    });

    return NextResponse.json({
      ok: true,
      released: toRelease.length,
      notification: { status: emailStatus, recipients: recipientCount },
    });
  } catch (err) {
    console.error("[cron release-pending-reservations]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
