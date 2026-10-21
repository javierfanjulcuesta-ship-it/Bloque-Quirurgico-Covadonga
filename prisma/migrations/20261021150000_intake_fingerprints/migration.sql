-- El Excel maestro no deja datos identificativos en la base.
-- Se eliminan filas e identidades y se sustituyen por huellas HMAC.

DROP TABLE IF EXISTS "IntakeRow";
DROP TABLE IF EXISTS "PatientIdentity";

ALTER TABLE "IntakeBatch" DROP COLUMN IF EXISTS "fileName";
ALTER TABLE "IntakeBatch" DROP COLUMN IF EXISTS "missingKeysJson";
ALTER TABLE "IntakeBatch" ADD COLUMN IF NOT EXISTS "missingCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "IntakeBatch" ADD COLUMN IF NOT EXISTS "dateMin" TEXT;
ALTER TABLE "IntakeBatch" ADD COLUMN IF NOT EXISTS "dateMax" TEXT;

CREATE TABLE "IntakeFingerprint" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "serviceDate" TEXT NOT NULL,
    "caseFingerprint" TEXT NOT NULL,
    "historyFingerprint" TEXT NOT NULL,
    "nameFingerprint" TEXT NOT NULL,
    CONSTRAINT "IntakeFingerprint_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IntakeFingerprint_serviceDate_idx" ON "IntakeFingerprint"("serviceDate");
CREATE INDEX "IntakeFingerprint_caseFingerprint_idx" ON "IntakeFingerprint"("caseFingerprint");
CREATE INDEX "IntakeFingerprint_historyFingerprint_idx" ON "IntakeFingerprint"("historyFingerprint");
ALTER TABLE "IntakeFingerprint"
  ADD CONSTRAINT "IntakeFingerprint_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "IntakeBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
