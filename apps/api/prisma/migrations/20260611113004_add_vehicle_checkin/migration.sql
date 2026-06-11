-- CreateEnum
CREATE TYPE "FuelLevel" AS ENUM ('EMPTY', 'QUARTER', 'HALF', 'THREE_QUARTERS', 'FULL');

-- CreateTable
CREATE TABLE "vehicle_checkins" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serviceOrderId" TEXT,
    "km" INTEGER,
    "fuelLevel" "FuelLevel",
    "damages" JSONB NOT NULL DEFAULT '[]',
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "signatureUrl" TEXT,
    "signedBy" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_checkins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_checkins_tenantId_createdAt_idx" ON "vehicle_checkins"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "vehicle_checkins_vehicleId_idx" ON "vehicle_checkins"("vehicleId");

-- CreateIndex
CREATE INDEX "vehicle_checkins_customerId_idx" ON "vehicle_checkins"("customerId");

-- CreateIndex
CREATE INDEX "vehicle_checkins_serviceOrderId_idx" ON "vehicle_checkins"("serviceOrderId");

-- AddForeignKey
ALTER TABLE "vehicle_checkins" ADD CONSTRAINT "vehicle_checkins_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_checkins" ADD CONSTRAINT "vehicle_checkins_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_checkins" ADD CONSTRAINT "vehicle_checkins_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_checkins" ADD CONSTRAINT "vehicle_checkins_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "service_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_checkins" ADD CONSTRAINT "vehicle_checkins_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
