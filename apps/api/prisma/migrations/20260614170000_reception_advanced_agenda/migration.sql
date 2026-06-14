CREATE TABLE "reception_schedule_blocks" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "technicianId" TEXT,
  "title" TEXT NOT NULL,
  "notes" TEXT,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "createdByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "reception_schedule_blocks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reception_schedule_blocks_tenantId_startAt_idx" ON "reception_schedule_blocks"("tenantId", "startAt");
CREATE INDEX "reception_schedule_blocks_tenantId_technicianId_startAt_idx" ON "reception_schedule_blocks"("tenantId", "technicianId", "startAt");

ALTER TABLE "reception_schedule_blocks"
  ADD CONSTRAINT "reception_schedule_blocks_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reception_schedule_blocks"
  ADD CONSTRAINT "reception_schedule_blocks_technicianId_fkey"
  FOREIGN KEY ("technicianId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
