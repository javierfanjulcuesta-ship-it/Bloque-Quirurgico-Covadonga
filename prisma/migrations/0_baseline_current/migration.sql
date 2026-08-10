-- Baseline migration for the current QxFlow schema.
-- Generated from prisma/schema.prisma with Prisma 6.19.2:
-- npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
--
-- IMPORTANT: on an existing production database this migration must NOT be executed.
-- It is intended to be marked as applied only after read-only schema verification
-- confirms that production matches this baseline. See docs/audit/DATABASE_BASELINE_PLAN.md.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('GESTOR', 'ANESTESISTA', 'CIRUJANO', 'ENDOSCOPISTA', 'GESTOR_ANESTESISTA');

-- CreateEnum
CREATE TYPE "Shift" AS ENUM ('MORNING', 'AFTERNOON');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'RELEASED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReservationOrigin" AS ENUM ('APP', 'EMAIL', 'GESTOR');

-- CreateEnum
CREATE TYPE "ReservationEventType" AS ENUM ('RESERVATION_CREATED', 'RESERVATION_CREATED_FROM_EMAIL', 'RESERVATION_UPDATED', 'RESERVATION_CANCELLED', 'RESERVATION_RELEASED', 'AUTO_RELEASE_TO_COMMON_POOL', 'RESERVATION_REJECTED_CONFLICT', 'RESERVATION_PATIENT_UPDATED', 'RESERVATION_PATIENT_REPLACED', 'RESERVATION_PATIENT_CANCELLED', 'PATIENT_WORKFLOW_STARTED', 'PREANESTHESIA_PENDING', 'PATIENT_NOTIFICATION_DRY_RUN_CREATED', 'ADMIN_NOTIFICATION_DRY_RUN_CREATED', 'ADMIN_NOTIFICATION_SKIPPED_NO_EMAIL', 'PATIENT_SURGICAL_CIRCUIT_SUSPENDED', 'PREANESTHESIA_APPOINTMENT_ASSIGNED', 'DEFERRED_URGENCY_CREATED', 'PREANESTHESIA_NO_SLOT_AVAILABLE');

-- CreateEnum
CREATE TYPE "AssignmentType" AS ENUM ('OR', 'PREANESTHESIA');

-- CreateEnum
CREATE TYPE "EmailClassification" AS ENUM ('RESERVATION', 'GENERAL', 'ACCESS_REQUEST', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "EmailProcessingStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "BlockOpeningStatus" AS ENUM ('OPEN', 'CLOSED', 'URGENT_RESERVED');

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "AnesthetistAssignment" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "shift" "Shift" NOT NULL,
    "assignmentType" "AssignmentType" NOT NULL DEFAULT 'OR',
    "resourceId" TEXT NOT NULL,
    "anesthetistId" TEXT NOT NULL,

    CONSTRAINT "AnesthetistAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "preanesthesiaAppointmentAt" TIMESTAMP(3),
    "isDeferredUrgency" BOOLEAN NOT NULL DEFAULT false,
    "specialCircuitReason" TEXT,

    CONSTRAINT "PatientInBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "EmailProcessingLog" (
    "id" TEXT NOT NULL,
    "emailMessageId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailProcessingLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "UserAuditEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "detailsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_date_resourceId_shift_slotIndex_key" ON "Reservation"("date", "resourceId", "shift", "slotIndex");

-- CreateIndex
CREATE INDEX "ReservationEvent_reservationId_idx" ON "ReservationEvent"("reservationId");

-- CreateIndex
CREATE INDEX "ReservationEvent_eventType_idx" ON "ReservationEvent"("eventType");

-- CreateIndex
CREATE INDEX "ReservationEvent_createdAt_idx" ON "ReservationEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AnesthetistAssignment_anesthetistId_idx" ON "AnesthetistAssignment"("anesthetistId");

-- CreateIndex
CREATE INDEX "AnesthetistAssignment_date_idx" ON "AnesthetistAssignment"("date");

-- CreateIndex
CREATE UNIQUE INDEX "AnesthetistAssignment_date_shift_assignmentType_resourceId_key" ON "AnesthetistAssignment"("date", "shift", "assignmentType", "resourceId");

-- CreateIndex
CREATE INDEX "PatientInBlock_preanesthesiaAppointmentAt_idx" ON "PatientInBlock"("preanesthesiaAppointmentAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_externalId_key" ON "EmailMessage"("externalId");

-- CreateIndex
CREATE INDEX "ContactMessage_createdAt_idx" ON "ContactMessage"("createdAt");

-- CreateIndex
CREATE INDEX "ReleaseNotificationLog_createdAt_idx" ON "ReleaseNotificationLog"("createdAt");

-- CreateIndex
CREATE INDEX "EmailProcessingLog_emailMessageId_idx" ON "EmailProcessingLog"("emailMessageId");

-- CreateIndex
CREATE INDEX "BlockOpeningPlan_date_idx" ON "BlockOpeningPlan"("date");

-- CreateIndex
CREATE INDEX "BlockOpeningPlan_resourceId_idx" ON "BlockOpeningPlan"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "BlockOpeningPlan_date_resourceId_shift_key" ON "BlockOpeningPlan"("date", "resourceId", "shift");

-- CreateIndex
CREATE UNIQUE INDEX "ProgrammingRule_key_key" ON "ProgrammingRule"("key");

-- CreateIndex
CREATE INDEX "ProgrammingRule_category_idx" ON "ProgrammingRule"("category");

-- CreateIndex
CREATE INDEX "ProgrammingRule_isActive_idx" ON "ProgrammingRule"("isActive");

-- CreateIndex
CREATE INDEX "UserAuditEvent_userId_idx" ON "UserAuditEvent"("userId");

-- CreateIndex
CREATE INDEX "UserAuditEvent_eventType_idx" ON "UserAuditEvent"("eventType");

-- CreateIndex
CREATE INDEX "UserAuditEvent_createdAt_idx" ON "UserAuditEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_surgeonId_fkey" FOREIGN KEY ("surgeonId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationEvent" ADD CONSTRAINT "ReservationEvent_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnesthetistAssignment" ADD CONSTRAINT "AnesthetistAssignment_anesthetistId_fkey" FOREIGN KEY ("anesthetistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientInBlock" ADD CONSTRAINT "PatientInBlock_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailProcessingLog" ADD CONSTRAINT "EmailProcessingLog_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockOpeningPlan" ADD CONSTRAINT "BlockOpeningPlan_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
