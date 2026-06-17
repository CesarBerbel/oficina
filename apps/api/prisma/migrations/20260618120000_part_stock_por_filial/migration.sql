-- Estoque por filial: saldo/reserva saem de Part e vão para part_stock (por oficina).
CREATE TABLE "part_stock" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "partId" TEXT NOT NULL,
  "currentStock" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "reservedStock" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "part_stock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "part_stock_tenantId_partId_key" ON "part_stock"("tenantId", "partId");
CREATE INDEX "part_stock_tenantId_idx" ON "part_stock"("tenantId");
CREATE INDEX "part_stock_partId_idx" ON "part_stock"("partId");

ALTER TABLE "part_stock"
  ADD CONSTRAINT "part_stock_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "part_stock"
  ADD CONSTRAINT "part_stock_partId_fkey"
  FOREIGN KEY ("partId") REFERENCES "parts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: cada peça vira um saldo na sua própria oficina (tenantId atual da peça).
INSERT INTO "part_stock" ("id", "tenantId", "partId", "currentStock", "reservedStock", "updatedAt")
SELECT gen_random_uuid(), "tenantId", "id", "currentStock", "reservedStock", now()
FROM "parts";

ALTER TABLE "parts" DROP COLUMN "currentStock";
ALTER TABLE "parts" DROP COLUMN "reservedStock";
