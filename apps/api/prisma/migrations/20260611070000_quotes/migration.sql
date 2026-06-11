-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('RASCUNHO', 'ENVIADO', 'APROVADO', 'APROVADO_PARCIAL', 'RECUSADO');

-- CreateEnum
CREATE TYPE "QuoteItemDecision" AS ENUM ('PENDENTE', 'APROVADO', 'RECUSADO');

-- CreateEnum
CREATE TYPE "QuoteDecisionType" AS ENUM ('TOTAL', 'PARCIAL', 'RECUSA');

-- AlterTable
ALTER TABLE "service_orders" ADD COLUMN     "publicToken" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'ENVIADO',
    "publicNotes" TEXT,
    "totalServices" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalParts" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "decisionType" "QuoteDecisionType",
    "decidedAt" TIMESTAMP(3),
    "decisionIp" TEXT,
    "decisionUa" TEXT,
    "signatureName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_items" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "kind" "ServiceOrderItemKind" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "decision" "QuoteItemDecision" NOT NULL DEFAULT 'PENDENTE',

    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotes_serviceOrderId_key" ON "quotes"("serviceOrderId");

-- CreateIndex
CREATE INDEX "quotes_tenantId_idx" ON "quotes"("tenantId");

-- CreateIndex
CREATE INDEX "quote_items_quoteId_idx" ON "quote_items"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "service_orders_publicToken_key" ON "service_orders"("publicToken");

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
