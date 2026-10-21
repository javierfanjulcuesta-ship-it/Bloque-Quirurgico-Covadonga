-- Cupo de quirófanos simultáneos por anestesista. No inserta personas:
-- Cárcelen, Fanjul y Dura viven en el catálogo de datos de la aplicación.

CREATE TABLE "AnesthetistProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "maxSimultaneousOr" INTEGER NOT NULL DEFAULT 2,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,
    CONSTRAINT "AnesthetistProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnesthetistProfile_userId_key" ON "AnesthetistProfile"("userId");

ALTER TABLE "AnesthetistProfile"
  ADD CONSTRAINT "AnesthetistProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
