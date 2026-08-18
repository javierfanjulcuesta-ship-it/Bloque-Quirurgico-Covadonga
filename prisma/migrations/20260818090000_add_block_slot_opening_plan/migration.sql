-- Code-only migration for slot-granular block opening overrides.
-- Not applied by this change.

CREATE TABLE "BlockSlotOpeningPlan" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "shift" "Shift" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "status" "BlockOpeningStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BlockSlotOpeningPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BlockSlotOpeningPlan_date_resourceId_shift_slotIndex_key"
ON "BlockSlotOpeningPlan"("date", "resourceId", "shift", "slotIndex");

CREATE INDEX "BlockSlotOpeningPlan_date_idx" ON "BlockSlotOpeningPlan"("date");
CREATE INDEX "BlockSlotOpeningPlan_resourceId_idx" ON "BlockSlotOpeningPlan"("resourceId");
CREATE INDEX "BlockSlotOpeningPlan_status_idx" ON "BlockSlotOpeningPlan"("status");

ALTER TABLE "BlockSlotOpeningPlan"
ADD CONSTRAINT "BlockSlotOpeningPlan_approvedByUserId_fkey"
FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
