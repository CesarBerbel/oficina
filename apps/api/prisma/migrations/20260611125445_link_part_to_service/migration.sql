-- AlterTable
ALTER TABLE "quote_items" ADD COLUMN     "parentItemId" TEXT;

-- AlterTable
ALTER TABLE "service_order_items" ADD COLUMN     "parentItemId" TEXT;

-- CreateIndex
CREATE INDEX "service_order_items_parentItemId_idx" ON "service_order_items"("parentItemId");

-- AddForeignKey
ALTER TABLE "service_order_items" ADD CONSTRAINT "service_order_items_parentItemId_fkey" FOREIGN KEY ("parentItemId") REFERENCES "service_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_parentItemId_fkey" FOREIGN KEY ("parentItemId") REFERENCES "quote_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
