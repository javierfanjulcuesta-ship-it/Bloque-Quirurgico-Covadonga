-- Baseline migration for the production-managed QxFlow schema observed on 2026-08-11.
-- IMPORTANT: this migration represents the Prisma-managed objects that already exist
-- in production BEFORE the reconciliation delta. It must NOT be executed against the
-- existing production database. On production it is intended to be marked as applied
-- only after backup and read-only verification. See docs/audit/16_PRODUCTION_SCHEMA_RECONCILIATION.md.
--
-- Intentionally NOT represented here because they are unmanaged legacy objects:
--   tables added_users, assignments, festivos, passwords, reservations
--   column Reservation.externalSurgeonName
-- These objects are preserved in production and are not dropped by this migration chain.

CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "UserRole" AS ENUM ('GESTOR', 'ANESTESISTA', 'CIRUJANO', 'ENDOSCOPISTA', 'GESTOR_ANESTESISTA');
CREATE TYPE "Shift" AS ENUM ('MORNING', 'AFTERNOON');
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'RELEASED', 'CANCELLED');
CREATE TYPE "ReservationOrigin" AS ENUM ('APP', 'EMAIL', 'GESTOR');
CREATE TYPE "ReservationEventType" AS ENUM (
  'RESERVATION_CREATED',
  'RESERVATION_CREATED_FROM_EMAIL',
  'RESERVATION_UPDATED',
  'RESERVATION_CANCELLED',
  'RESERVATION_RELEASED',
  'AUTO_RELEASE_TO_COMMON_POOL',
  'RESERVATION_REJECTED_CONFLICT',
  'RESERVATION_PATIENT_UPDATED',
  'RESERVATION_PATIENT_REPLACED',
  'RESERVATION_PATIENT_CANCELLED',
  'PATIENT_WORKFLOW_STARTED'
);
CREATE TYPE "AssignmentType" AS ENUM ('OR', 'PREANESTHESIA');
CREATE TYPE "EmailClassification" AS ENUM ('RESERVATION', 'GENERAL', 'ACCESS_REQUEST', 'UNKNOWN');
CREATE TYPE "EmailProcessingStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED', 'SKIPPED');
CREATE TYPE "BlockOpeningStatus" AS ENUM ('OPEN', 'CLOSED', 'URGENT_RESERVED');

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "canSespa" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "deletionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "resourceId" TEXT NOT NULL,
    "shift" "Shift" NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "surgeonId" TEXT NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "anesthetistId" TEXT,
    "origin" "ReservationOrigin" NOT NULL DEFAULT 'APP',
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "releasedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "releaseReason" TEXT,
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReservationEvent" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT,
    "eventType" "ReservationEventType" NOT NULL,
    "actorUserId" TEXT,
    "origin" TEXT,
    "detailsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReservationEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnesthetistAssignment" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "shift" "Shift" NOT NULL,
    "assignmentType" "AssignmentType" NOT NULL DEFAULT 'OR',
    "resourceId" TEXT NOT NULL,
    "anesthetistId" TEXT NOT NULL,
    CONSTRAINT "AnesthetistAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatientInBlock" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "historyNumber" TEXT NOT NULL,
    "fullName" TEXT,
    "procedure" TEXT NOT NULL,
    "estimatedDurationMinutes" INTEGER NOT NULL,
    "anesthesiaType" TEXT NOT NULL,
    "insuranceType" TEXT NOT NULL,
    "admissionType" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "notes" TEXT,
    "solicitudRecursos" TEXT,
    "patientEmail" TEXT,
    "patientPhone" TEXT,
    "workflowStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "preanesthesiaStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "financingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    CONSTRAINT "PatientInBlock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "subject" TEXT NOT NULL,
    "bodyPlain" TEXT,
    "bodySummary" TEXT,
    "bodyHtml" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "classification" "EmailClassification" NOT NULL DEFAULT 'UNKNOWN',
    "processingStatus" "EmailProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "resultMessage" TEXT,
    "senderUserId" TEXT,
    "reservationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReleaseNotificationLog" (
    "id" TEXT NOT NULL,
    "releasedCount" INTEGER NOT NULL,
    "slotDetailsJson" TEXT NOT NULL,
    "releasedReservationIds" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "emailStatus" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReleaseNotificationLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailProcessingLog" (
    "id" TEXT NOT NULL,
    "emailMessageId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailProcessingLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BlockOpeningPlan" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "shift" "Shift" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "status" "BlockOpeningStatus" NOT NULL DEFAULT 'OPEN',
    "minRequiredMinutes" INTEGER NOT NULL DEFAULT 0,
    "reservedUrgentMinutes" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BlockOpeningPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProgrammingRule" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'scheduling',
    "valueJson" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,
    CONSTRAINT "ProgrammingRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserAuditEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "detailsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Reservation_date_resourceId_shift_slotIndex_key" ON "Reservation"("date", "resourceId", "shift", "slotIndex");
CREATE INDEX "ReservationEvent_reservationId_idx" ON "ReservationEvent"("reservationId");
CREATE INDEX "ReservationEvent_eventType_idx" ON "ReservationEvent"("eventType");
CREATE INDEX "ReservationEvent_createdAt_idx" ON "ReservationEvent"("createdAt");
CREATE INDEX "AnesthetistAssignment_anesthetistId_idx" ON "AnesthetistAssignment"("anesthetistId");
CREATE INDEX "AnesthetistAssignment_date_idx" ON "AnesthetistAssignment"("date");
CREATE UNIQUE INDEX "AnesthetistAssignment_date_shift_assignmentType_resourceId_key" ON "AnesthetistAssignment"("date", "shift", "assignmentType", "resourceId");
CREATE UNIQUE INDEX "EmailMessage_externalId_key" ON "EmailMessage"("externalId");
CREATE INDEX "ContactMessage_createdAt_idx" ON "ContactMessage"("createdAt");
CREATE INDEX "ReleaseNotificationLog_createdAt_idx" ON "ReleaseNotificationLog"("createdAt");
CREATE INDEX "EmailProcessingLog_emailMessageId_idx" ON "EmailProcessingLog"("emailMessageId");
CREATE INDEX "BlockOpeningPlan_date_idx" ON "BlockOpeningPlan"("date");
CREATE INDEX "BlockOpeningPlan_resourceId_idx" ON "BlockOpeningPlan"("resourceId");
CREATE UNIQUE INDEX "BlockOpeningPlan_date_resourceId_shift_key" ON "BlockOpeningPlan"("date", "resourceId", "shift");
CREATE UNIQUE INDEX "ProgrammingRule_key_key" ON "ProgrammingRule"("key");
CREATE INDEX "ProgrammingRule_category_idx" ON "ProgrammingRule"("category");
CREATE INDEX "ProgrammingRule_isActive_idx" ON "ProgrammingRule"("isActive");
CREATE INDEX "UserAuditEvent_userId_idx" ON "UserAuditEvent"("userId");
CREATE INDEX "UserAuditEvent_eventType_idx" ON "UserAuditEvent"("eventType");
CREATE INDEX "UserAuditEvent_createdAt_idx" ON "UserAuditEvent"("createdAt");

ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_surgeonId_fkey" FOREIGN KEY ("surgeonId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReservationEvent" ADD CONSTRAINT "ReservationEvent_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnesthetistAssignment" ADD CONSTRAINT "AnesthetistAssignment_anesthetistId_fkey" FOREIGN KEY ("anesthetistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientInBlock" ADD CONSTRAINT "PatientInBlock_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailProcessingLog" ADD CONSTRAINT "EmailProcessingLog_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlockOpeningPlan" ADD CONSTRAINT "BlockOpeningPlan_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
