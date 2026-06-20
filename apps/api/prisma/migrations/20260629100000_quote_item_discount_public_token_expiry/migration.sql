-- Desconto percentual por item do orçamento e expiração do token público da OS.
ALTER TABLE "service_orders"
ADD COLUMN "publicTokenExpiresAt" TIMESTAMP(3);

UPDATE "service_orders"
SET "publicTokenExpiresAt" = CASE
  WHEN "closedAt" IS NOT NULL THEN "closedAt"
  ELSE NOW() + INTERVAL '90 days'
END
WHERE "publicTokenExpiresAt" IS NULL;

ALTER TABLE "quote_items"
ADD COLUMN "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE INDEX "service_orders_publicTokenExpiresAt_idx" ON "service_orders"("publicTokenExpiresAt");
