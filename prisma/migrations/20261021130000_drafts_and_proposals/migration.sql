-- Suspensión, cambios de programa, borradores de parte y propuestas.
-- No envía correos ni crea reservas.

ALTER TABLE "PatientInBlock" ADD COLUMN "suspensionReason" TEXT;
ALTER TABLE "PatientInBlock" ADD COLUMN "suspensionNote" TEXT;

CREATE TABLE "ScheduleChange" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT,
    "patientId" TEXT,
    "changeType" TEXT NOT NULL,
    "beforeJson" TEXT NOT NULL,
    "afterJson" TEXT NOT NULL,
    "reasonCode" TEXT,
    "reasonText" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduleChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ScheduleChange_reservationId_idx" ON "ScheduleChange"("reservationId");
CREATE INDEX "ScheduleChange_patientId_idx" ON "ScheduleChange"("patientId");
CREATE INDEX "ScheduleChange_createdAt_idx" ON "ScheduleChange"("createdAt");

CREATE TABLE "MailTeam" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "MailTeam_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MailTeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "MailTeamMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MailTeamMember_teamId_userId_key" ON "MailTeamMember"("teamId", "userId");
CREATE INDEX "MailTeamMember_userId_idx" ON "MailTeamMember"("userId");
ALTER TABLE "MailTeamMember"
  ADD CONSTRAINT "MailTeamMember_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "MailTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ServiceRecipient" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "ServiceRecipient_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ServiceRecipient_key_key" ON "ServiceRecipient"("key");

CREATE TABLE "OutboundDraft" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "reservationId" TEXT,
    "proposalId" TEXT,
    "warning" TEXT,
    "createdByUserId" TEXT,
    "sentByUserId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OutboundDraft_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OutboundDraft_status_idx" ON "OutboundDraft"("status");
CREATE INDEX "OutboundDraft_reservationId_idx" ON "OutboundDraft"("reservationId");

CREATE TABLE "OutboundDraftRecipient" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    CONSTRAINT "OutboundDraftRecipient_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OutboundDraftRecipient_draftId_idx" ON "OutboundDraftRecipient"("draftId");
ALTER TABLE "OutboundDraftRecipient"
  ADD CONSTRAINT "OutboundDraftRecipient_draftId_fkey"
  FOREIGN KEY ("draftId") REFERENCES "OutboundDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "weekStart" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "summary" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "decisionReason" TEXT,
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Proposal_status_idx" ON "Proposal"("status");
CREATE INDEX "Proposal_weekStart_idx" ON "Proposal"("weekStart");
