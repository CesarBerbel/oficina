-- Desconto percentual por item da OS (aplicado ao gerar o orçamento).
ALTER TABLE "service_order_items"
  ADD COLUMN "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;
