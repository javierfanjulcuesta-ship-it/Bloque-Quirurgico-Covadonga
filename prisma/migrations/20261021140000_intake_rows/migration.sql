-- Filas revisables del Excel maestro. No crea reservas ni usuarios.

CREATE TABLE "IntakeBatch" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sheetNames" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REVIEW',
    "rowCount" INTEGER NOT NULL,
    "missingKeysJson" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntakeBatch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IntakeBatch_createdAt_idx" ON "IntakeBatch"("createdAt");

CREATE TABLE "IntakeRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "historyNumber" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "procedure" TEXT NOT NULL,
    "serviceDate" TEXT NOT NULL,
    "shift" TEXT,
    "resourceId" TEXT,
    "slotIndex" INTEGER,
    "surgeonName" TEXT,
    "minutes" INTEGER NOT NULL DEFAULT 60,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "flags" TEXT NOT NULL DEFAULT '',
    "suggestedShift" TEXT,
    "suggestedResourceId" TEXT,
    "reservationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntakeRow_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IntakeRow_dedupKey_idx" ON "IntakeRow"("dedupKey");
CREATE INDEX "IntakeRow_historyNumber_idx" ON "IntakeRow"("historyNumber");
CREATE INDEX "IntakeRow_status_idx" ON "IntakeRow"("status");
CREATE INDEX "IntakeRow_serviceDate_idx" ON "IntakeRow"("serviceDate");
ALTER TABLE "IntakeRow"
  ADD CONSTRAINT "IntakeRow_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "IntakeBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PatientIdentity" (
    "id" TEXT NOT NULL,
    "historyNumber" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PatientIdentity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PatientIdentity_historyNumber_key" ON "PatientIdentity"("historyNumber");
