-- Prepara el guardado cifrado futuro. No borra columnas ni reescribe textos ya guardados.
-- La purga del histórico es un script manual y no forma parte de esta migración.

ALTER TABLE "EmailMessage" ADD COLUMN IF NOT EXISTS "identityMode" TEXT NOT NULL DEFAULT 'redacted';
ALTER TABLE "EmailMessage" ADD COLUMN IF NOT EXISTS "bodyRedactedAt" TIMESTAMP(3);

ALTER TABLE "ContactMessage" ADD COLUMN IF NOT EXISTS "identityMode" TEXT NOT NULL DEFAULT 'redacted';
ALTER TABLE "ContactMessage" ADD COLUMN IF NOT EXISTS "bodyRedactedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "PatientIdentityRecord" (
    "id" TEXT NOT NULL,
    "subjectKind" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "keyVersion" TEXT NOT NULL,
    "retentionUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PatientIdentityRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PatientIdentityRecord_subjectKind_subjectId_idx"
  ON "PatientIdentityRecord"("subjectKind", "subjectId");
CREATE INDEX IF NOT EXISTS "PatientIdentityRecord_retentionUntil_idx"
  ON "PatientIdentityRecord"("retentionUntil");

CREATE TABLE IF NOT EXISTS "IdentityAccessAudit" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "role" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "subjectKind" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IdentityAccessAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IdentityAccessAudit_subjectId_idx" ON "IdentityAccessAudit"("subjectId");
CREATE INDEX IF NOT EXISTS "IdentityAccessAudit_createdAt_idx" ON "IdentityAccessAudit"("createdAt");
