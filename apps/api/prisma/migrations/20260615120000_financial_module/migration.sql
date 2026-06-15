CREATE TYPE "FinancialEntryType" AS ENUM ('RECEIVABLE', 'PAYABLE');
CREATE TYPE "FinancialEntryStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'CANCELED');
CREATE TYPE "FinancialPaymentMethod" AS ENUM ('DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'BOLETO', 'TRANSFERENCIA', 'CHEQUE', 'OUTRO');
CREATE TYPE "FinancialEntryOrigin" AS ENUM ('MANUAL', 'SERVICE_ORDER', 'PURCHASE_ORDER');

CREATE TABLE "financial_entries" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "type" "FinancialEntryType" NOT NULL,
  "status" "FinancialEntryStatus" NOT NULL DEFAULT 'OPEN',
  "origin" "FinancialEntryOrigin" NOT NULL DEFAULT 'MANUAL',
  "description" TEXT NOT NULL,
  "category" TEXT,
  "customerId" TEXT,
  "supplierId" TEXT,
  "serviceOrderId" TEXT,
  "purchaseOrderId" TEXT,
  "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "remainingAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "financial_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "financial_payments" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "method" "FinancialPaymentMethod" NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "financial_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "financial_entries_tenantId_serviceOrderId_type_key" ON "financial_entries"("tenantId", "serviceOrderId", "type");
CREATE UNIQUE INDEX "financial_entries_tenantId_purchaseOrderId_type_key" ON "financial_entries"("tenantId", "purchaseOrderId", "type");
CREATE INDEX "financial_entries_tenantId_type_status_idx" ON "financial_entries"("tenantId", "type", "status");
CREATE INDEX "financial_entries_tenantId_dueDate_idx" ON "financial_entries"("tenantId", "dueDate");
CREATE INDEX "financial_entries_tenantId_customerId_idx" ON "financial_entries"("tenantId", "customerId");
CREATE INDEX "financial_entries_tenantId_supplierId_idx" ON "financial_entries"("tenantId", "supplierId");
CREATE INDEX "financial_payments_tenantId_paidAt_idx" ON "financial_payments"("tenantId", "paidAt");
CREATE INDEX "financial_payments_entryId_idx" ON "financial_payments"("entryId");

ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "service_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "financial_payments" ADD CONSTRAINT "financial_payments_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "financial_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
