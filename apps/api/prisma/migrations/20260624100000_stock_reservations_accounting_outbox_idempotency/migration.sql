-- Reservas formais de estoque, ledger contábil por partidas dobradas e idempotência de outbox/dispatch.

CREATE TYPE "StockReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CONSUMED', 'CANCELED');
CREATE TYPE "AccountingAccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
CREATE TYPE "AccountingJournalStatus" AS ENUM ('POSTED', 'VOIDED');

ALTER TABLE "outbox_messages" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "outbox_messages_idempotencyKey_key" ON "outbox_messages"("idempotencyKey");
CREATE INDEX "outbox_messages_tenantId_type_idx" ON "outbox_messages"("tenantId", "type");

ALTER TABLE "message_logs" ADD COLUMN "dispatchKey" TEXT;
CREATE UNIQUE INDEX "message_logs_dispatchKey_key" ON "message_logs"("dispatchKey");
CREATE INDEX "message_logs_tenantId_event_serviceOrderId_idx" ON "message_logs"("tenantId", "event", "serviceOrderId");

CREATE TABLE "stock_reservations" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "serviceOrderId" TEXT NOT NULL,
  "partId" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "status" "StockReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stock_reservations_tenantId_status_idx" ON "stock_reservations"("tenantId", "status");
CREATE INDEX "stock_reservations_serviceOrderId_status_idx" ON "stock_reservations"("serviceOrderId", "status");
CREATE INDEX "stock_reservations_partId_status_idx" ON "stock_reservations"("partId", "status");

ALTER TABLE "stock_reservations"
  ADD CONSTRAINT "stock_reservations_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_reservations"
  ADD CONSTRAINT "stock_reservations_serviceOrderId_fkey"
  FOREIGN KEY ("serviceOrderId") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_reservations"
  ADD CONSTRAINT "stock_reservations_partId_fkey"
  FOREIGN KEY ("partId") REFERENCES "parts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "accounting_accounts" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "AccountingAccountType" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accounting_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accounting_accounts_tenantId_code_key" ON "accounting_accounts"("tenantId", "code");
CREATE INDEX "accounting_accounts_tenantId_type_idx" ON "accounting_accounts"("tenantId", "type");

ALTER TABLE "accounting_accounts"
  ADD CONSTRAINT "accounting_accounts_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "accounting_journal_entries" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "financialEntryId" TEXT,
  "kind" "FinancialLedgerKind" NOT NULL,
  "status" "AccountingJournalStatus" NOT NULL DEFAULT 'POSTED',
  "description" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accounting_journal_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "accounting_journal_entries_tenantId_createdAt_idx" ON "accounting_journal_entries"("tenantId", "createdAt");
CREATE INDEX "accounting_journal_entries_financialEntryId_idx" ON "accounting_journal_entries"("financialEntryId");

ALTER TABLE "accounting_journal_entries"
  ADD CONSTRAINT "accounting_journal_entries_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accounting_journal_entries"
  ADD CONSTRAINT "accounting_journal_entries_financialEntryId_fkey"
  FOREIGN KEY ("financialEntryId") REFERENCES "financial_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "accounting_journal_lines" (
  "id" TEXT NOT NULL,
  "journalEntryId" TEXT NOT NULL,
  "debitAccountId" TEXT NOT NULL,
  "creditAccountId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "memo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accounting_journal_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "accounting_journal_lines_journalEntryId_idx" ON "accounting_journal_lines"("journalEntryId");
CREATE INDEX "accounting_journal_lines_debitAccountId_idx" ON "accounting_journal_lines"("debitAccountId");
CREATE INDEX "accounting_journal_lines_creditAccountId_idx" ON "accounting_journal_lines"("creditAccountId");

ALTER TABLE "accounting_journal_lines"
  ADD CONSTRAINT "accounting_journal_lines_journalEntryId_fkey"
  FOREIGN KEY ("journalEntryId") REFERENCES "accounting_journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accounting_journal_lines"
  ADD CONSTRAINT "accounting_journal_lines_debitAccountId_fkey"
  FOREIGN KEY ("debitAccountId") REFERENCES "accounting_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accounting_journal_lines"
  ADD CONSTRAINT "accounting_journal_lines_creditAccountId_fkey"
  FOREIGN KEY ("creditAccountId") REFERENCES "accounting_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Imutabilidade básica: linhas contábeis postadas não são alteradas em-place.
CREATE OR REPLACE FUNCTION accounting_journal_lines_block_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'accounting_journal_lines é append-only: UPDATE não é permitido';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS accounting_journal_lines_no_update ON "accounting_journal_lines";
CREATE TRIGGER accounting_journal_lines_no_update
  BEFORE UPDATE ON "accounting_journal_lines"
  FOR EACH ROW EXECUTE FUNCTION accounting_journal_lines_block_update();
