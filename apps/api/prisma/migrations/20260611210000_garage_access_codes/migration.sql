-- Códigos de acesso à área do cliente (consulta de histórico do veículo pela placa).
CREATE TABLE "garage_access_codes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "garage_access_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "garage_access_codes_tenantId_vehicleId_idx" ON "garage_access_codes"("tenantId", "vehicleId");
CREATE INDEX "garage_access_codes_expiresAt_idx" ON "garage_access_codes"("expiresAt");

ALTER TABLE "garage_access_codes" ADD CONSTRAINT "garage_access_codes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "garage_access_codes" ADD CONSTRAINT "garage_access_codes_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "garage_access_codes" ADD CONSTRAINT "garage_access_codes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
