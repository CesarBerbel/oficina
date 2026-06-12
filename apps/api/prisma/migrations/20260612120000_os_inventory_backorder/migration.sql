-- Novo status: OS aprovada aguardando a chegada de peça (pedido de compra gerado).
ALTER TYPE "ServiceOrderStatus" ADD VALUE IF NOT EXISTS 'AGUARDANDO_PECA' AFTER 'ORCAMENTO_RECUSADO';

-- Liga o pedido de compra à OS que o originou (backorder por falta de estoque).
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "serviceOrderId" TEXT;
CREATE INDEX IF NOT EXISTS "purchase_orders_serviceOrderId_idx" ON "purchase_orders"("serviceOrderId");
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "service_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
