-- Persist anesthetist unavailability in PostgreSQL so it is shared across devices.
-- Additive migration; no existing rows are modified.

CREATE TABLE "AnesthetistUnavailability" (
    "id" TEXT NOT NULL,
    "anesthetistId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "shift" "Shift" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AnesthetistUnavailability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnesthetistUnavailability_anesthetistId_date_shift_key"
  ON "AnesthetistUnavailability"("anesthetistId", "date", "shift");
CREATE INDEX "AnesthetistUnavailability_anesthetistId_idx"
  ON "AnesthetistUnavailability"("anesthetistId");
CREATE INDEX "AnesthetistUnavailability_date_idx"
  ON "AnesthetistUnavailability"("date");

ALTER TABLE "AnesthetistUnavailability"
  ADD CONSTRAINT "AnesthetistUnavailability_anesthetistId_fkey"
  FOREIGN KEY ("anesthetistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
