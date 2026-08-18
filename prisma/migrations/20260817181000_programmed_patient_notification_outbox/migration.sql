-- Durable outbox for programmed-patient management notifications.
-- Code-only migration in hardening; do not apply to production from preview/demo.

CREATE TYPE "NotificationOutboxStatus" AS ENUM ('PENDING', 'FAILED', 'SENT');

CREATE TABLE "ProgrammedPatientNotificationOutbox" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT,
    "status" "NotificationOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgrammedPatientNotificationOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProgrammedPatientNotificationOutbox_idempotencyKey_key"
ON "ProgrammedPatientNotificationOutbox"("idempotencyKey");

CREATE INDEX "ProgrammedPatientNotificationOutbox_status_nextAttemptAt_idx"
ON "ProgrammedPatientNotificationOutbox"("status", "nextAttemptAt");

CREATE INDEX "ProgrammedPatientNotificationOutbox_reservationId_idx"
ON "ProgrammedPatientNotificationOutbox"("reservationId");

CREATE INDEX "ProgrammedPatientNotificationOutbox_patientId_idx"
ON "ProgrammedPatientNotificationOutbox"("patientId");
