-- Sugerencias de turno y quirófano por cirujano. No inserta usuarios.

CREATE TABLE "SurgeonDefault" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defaultShift" "Shift",
    "preferredResourceId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,
    CONSTRAINT "SurgeonDefault_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SurgeonDefault_userId_key" ON "SurgeonDefault"("userId");

ALTER TABLE "SurgeonDefault"
  ADD CONSTRAINT "SurgeonDefault_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
