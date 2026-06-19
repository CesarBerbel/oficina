-- Sessões/observabilidade/estoque/contabilidade avançados.
-- Adiciona estorno formal de baixas financeiras sem alterar os fluxos existentes.

ALTER TYPE "FinancialLedgerKind" ADD VALUE IF NOT EXISTS 'PAYMENT_REVERSAL';

ALTER TABLE "financial_payments"
  ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reversedById" TEXT,
  ADD COLUMN IF NOT EXISTS "reversalReason" TEXT;

CREATE INDEX IF NOT EXISTS "financial_payments_tenantId_reversedAt_idx"
  ON "financial_payments"("tenantId", "reversedAt");
