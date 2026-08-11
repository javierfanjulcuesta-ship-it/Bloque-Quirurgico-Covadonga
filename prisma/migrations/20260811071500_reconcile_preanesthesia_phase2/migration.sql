-- Forward reconciliation from the production snapshot observed 2026-08-11
-- to prisma/schema.prisma. Designed to be safe on the existing production DB
-- after the baseline migration has been marked as applied.
--
-- This migration only adds missing enum values, nullable/defaulted columns and an index.
-- It does not drop, rename or rewrite existing application data.

ALTER TYPE "ReservationEventType" ADD VALUE IF NOT EXISTS 'PREANESTHESIA_PENDING';
ALTER TYPE "ReservationEventType" ADD VALUE IF NOT EXISTS 'PATIENT_NOTIFICATION_DRY_RUN_CREATED';
ALTER TYPE "ReservationEventType" ADD VALUE IF NOT EXISTS 'ADMIN_NOTIFICATION_DRY_RUN_CREATED';
ALTER TYPE "ReservationEventType" ADD VALUE IF NOT EXISTS 'ADMIN_NOTIFICATION_SKIPPED_NO_EMAIL';
ALTER TYPE "ReservationEventType" ADD VALUE IF NOT EXISTS 'PATIENT_SURGICAL_CIRCUIT_SUSPENDED';
ALTER TYPE "ReservationEventType" ADD VALUE IF NOT EXISTS 'PREANESTHESIA_APPOINTMENT_ASSIGNED';
ALTER TYPE "ReservationEventType" ADD VALUE IF NOT EXISTS 'DEFERRED_URGENCY_CREATED';
ALTER TYPE "ReservationEventType" ADD VALUE IF NOT EXISTS 'PREANESTHESIA_NO_SLOT_AVAILABLE';

ALTER TABLE "PatientInBlock"
  ADD COLUMN IF NOT EXISTS "preanesthesiaAppointmentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "isDeferredUrgency" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "specialCircuitReason" TEXT;

CREATE INDEX IF NOT EXISTS "PatientInBlock_preanesthesiaAppointmentAt_idx"
  ON "PatientInBlock"("preanesthesiaAppointmentAt");
