-- Apartado provisional y auditoría del correo. No borra textos ni guarda pacientes.

CREATE TABLE IF NOT EXISTS "ProvisionalHold" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT,
    "date" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "shift" TEXT NOT NULL,
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'HOLD',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProvisionalHold_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProvisionalHold_proposalId_idx" ON "ProvisionalHold"("proposalId");
CREATE INDEX IF NOT EXISTS "ProvisionalHold_expiresAt_idx" ON "ProvisionalHold"("expiresAt");

CREATE TABLE IF NOT EXISTS "MailboxAudit" (
    "id" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "actorUserId" TEXT,
    "proposalId" TEXT,
    "detailJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MailboxAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MailboxAudit_proposalId_idx" ON "MailboxAudit"("proposalId");
CREATE INDEX IF NOT EXISTS "MailboxAudit_createdAt_idx" ON "MailboxAudit"("createdAt");
