-- Fase 1: contacto y estados de circuito en PatientInBlock; nuevos tipos de evento (trazabilidad dry-run).

ALTER TABLE "PatientInBlock" ADD COLUMN IF NOT EXISTS "patientEmail" TEXT;
ALTER TABLE "PatientInBlock" ADD COLUMN IF NOT EXISTS "patientPhone" TEXT;

ALTER TABLE "PatientInBlock" ADD COLUMN IF NOT EXISTS "workflowStatus" TEXT;
ALTER TABLE "PatientInBlock" ADD COLUMN IF NOT EXISTS "preanesthesiaStatus" TEXT;
ALTER TABLE "PatientInBlock" ADD COLUMN IF NOT EXISTS "financingStatus" TEXT;

UPDATE "PatientInBlock" SET "workflowStatus" = 'ACTIVE' WHERE "workflowStatus" IS NULL;
UPDATE "PatientInBlock" SET "preanesthesiaStatus" = 'PENDING' WHERE "preanesthesiaStatus" IS NULL;
UPDATE "PatientInBlock" SET "financingStatus" = 'PENDING' WHERE "financingStatus" IS NULL;

ALTER TABLE "PatientInBlock" ALTER COLUMN "workflowStatus" SET DEFAULT 'ACTIVE';
ALTER TABLE "PatientInBlock" ALTER COLUMN "preanesthesiaStatus" SET DEFAULT 'PENDING';
ALTER TABLE "PatientInBlock" ALTER COLUMN "financingStatus" SET DEFAULT 'PENDING';

ALTER TABLE "PatientInBlock" ALTER COLUMN "workflowStatus" SET NOT NULL;
ALTER TABLE "PatientInBlock" ALTER COLUMN "preanesthesiaStatus" SET NOT NULL;
ALTER TABLE "PatientInBlock" ALTER COLUMN "financingStatus" SET NOT NULL;

ALTER TYPE "ReservationEventType" ADD VALUE 'PATIENT_WORKFLOW_STARTED';
ALTER TYPE "ReservationEventType" ADD VALUE 'PREANESTHESIA_PENDING';
ALTER TYPE "ReservationEventType" ADD VALUE 'PATIENT_NOTIFICATION_DRY_RUN_CREATED';
ALTER TYPE "ReservationEventType" ADD VALUE 'ADMIN_NOTIFICATION_DRY_RUN_CREATED';
ALTER TYPE "ReservationEventType" ADD VALUE 'ADMIN_NOTIFICATION_SKIPPED_NO_EMAIL';
ALTER TYPE "ReservationEventType" ADD VALUE 'PATIENT_SURGICAL_CIRCUIT_SUSPENDED';
