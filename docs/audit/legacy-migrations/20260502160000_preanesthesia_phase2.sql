-- ARCHIVED LEGACY MIGRATION. DO NOT APPLY AS PART OF THE NEW ACTIVE CHAIN.
-- Original: prisma/migrations/20260502160000_preanesthesia_phase2/migration.sql

-- Fase 2: autocita preanestesia, urgencia diferida, eventos de trazabilidad.

ALTER TABLE "PatientInBlock" ADD COLUMN "preanesthesiaAppointmentAt" TIMESTAMP(3);
ALTER TABLE "PatientInBlock" ADD COLUMN "isDeferredUrgency" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PatientInBlock" ADD COLUMN "specialCircuitReason" TEXT;

ALTER TYPE "ReservationEventType" ADD VALUE 'PREANESTHESIA_APPOINTMENT_ASSIGNED';
ALTER TYPE "ReservationEventType" ADD VALUE 'DEFERRED_URGENCY_CREATED';
ALTER TYPE "ReservationEventType" ADD VALUE 'PREANESTHESIA_NO_SLOT_AVAILABLE';

CREATE INDEX "PatientInBlock_preanesthesiaAppointmentAt_idx" ON "PatientInBlock"("preanesthesiaAppointmentAt");
