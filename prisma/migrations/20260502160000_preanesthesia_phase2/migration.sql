-- Fase 2: autocita preanestesia, urgencia diferida, eventos de trazabilidad.

ALTER TABLE "PatientInBlock" ADD COLUMN "preanesthesiaAppointmentAt" TIMESTAMP(3);
ALTER TABLE "PatientInBlock" ADD COLUMN "isDeferredUrgency" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PatientInBlock" ADD COLUMN "specialCircuitReason" TEXT;

ALTER TYPE "ReservationEventType" ADD VALUE 'PREANESTHESIA_APPOINTMENT_ASSIGNED';
ALTER TYPE "ReservationEventType" ADD VALUE 'DEFERRED_URGENCY_CREATED';
ALTER TYPE "ReservationEventType" ADD VALUE 'PREANESTHESIA_NO_SLOT_AVAILABLE';

CREATE INDEX "PatientInBlock_preanesthesiaAppointmentAt_idx" ON "PatientInBlock"("preanesthesiaAppointmentAt");
