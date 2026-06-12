-- Reserva de estoque (hard allocation): quantidade comprometida com OS aprovadas.
ALTER TABLE "parts" ADD COLUMN IF NOT EXISTS "reservedStock" DECIMAL(12,3) NOT NULL DEFAULT 0;

-- Vínculo opcional da peça a um fornecedor cadastrado (consolidação de compras).
ALTER TABLE "parts" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;
CREATE INDEX IF NOT EXISTS "parts_supplierId_idx" ON "parts"("supplierId");
ALTER TABLE "parts" ADD CONSTRAINT "parts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Marca se a OS mantém reserva de estoque ativa (aprovada e não consumida).
ALTER TABLE "service_orders" ADD COLUMN IF NOT EXISTS "partsReserved" BOOLEAN NOT NULL DEFAULT false;
