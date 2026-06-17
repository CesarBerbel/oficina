-- Ledger financeiro imutável (append-only): movimentos de cada lançamento.
CREATE TYPE "FinancialLedgerKind" AS ENUM ('ISSUE', 'ADJUSTMENT', 'PAYMENT', 'CANCELLATION');

CREATE TABLE "financial_ledger_entries" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "kind" "FinancialLedgerKind" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "description" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "financial_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "financial_ledger_entries_tenantId_createdAt_idx" ON "financial_ledger_entries"("tenantId", "createdAt");
CREATE INDEX "financial_ledger_entries_entryId_idx" ON "financial_ledger_entries"("entryId");

ALTER TABLE "financial_ledger_entries"
  ADD CONSTRAINT "financial_ledger_entries_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "financial_ledger_entries"
  ADD CONSTRAINT "financial_ledger_entries_entryId_fkey"
  FOREIGN KEY ("entryId") REFERENCES "financial_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Imutabilidade: nenhum movimento do ledger pode ser alterado.
-- (DELETE permanece para o cascade ao remover tenant/lançamento.)
CREATE OR REPLACE FUNCTION financial_ledger_block_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'financial_ledger_entries é imutável: UPDATE não é permitido';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS financial_ledger_no_update ON "financial_ledger_entries";
CREATE TRIGGER financial_ledger_no_update
  BEFORE UPDATE ON "financial_ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION financial_ledger_block_update();
