CREATE TYPE "ServiceOrderEventType" AS ENUM ('STATUS_CHANGE', 'NOTE', 'CHECKLIST', 'PHOTOS', 'CUSTOMER_NOTIFICATION', 'SYSTEM');
CREATE TYPE "ServiceOrderEventVisibility" AS ENUM ('INTERNAL', 'PUBLIC');

CREATE TABLE "service_order_events" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "serviceOrderId" TEXT NOT NULL,
  "type" "ServiceOrderEventType" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "visibility" "ServiceOrderEventVisibility" NOT NULL DEFAULT 'INTERNAL',
  "fromStatus" "ServiceOrderStatus",
  "toStatus" "ServiceOrderStatus",
  "checklist" JSONB,
  "photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "metadata" JSONB,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "service_order_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "service_order_events_tenantId_createdAt_idx" ON "service_order_events"("tenantId", "createdAt");
CREATE INDEX "service_order_events_serviceOrderId_createdAt_idx" ON "service_order_events"("serviceOrderId", "createdAt");
CREATE INDEX "service_order_events_tenantId_type_idx" ON "service_order_events"("tenantId", "type");

ALTER TABLE "service_order_events" ADD CONSTRAINT "service_order_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_order_events" ADD CONSTRAINT "service_order_events_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_order_events" ADD CONSTRAINT "service_order_events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
