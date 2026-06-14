CREATE TABLE "operational_settings" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "appointmentLookaheadHours" INTEGER NOT NULL DEFAULT 12,
  "waitingCustomerMinutes" INTEGER NOT NULL DEFAULT 30,
  "stalledServiceOrderHours" INTEGER NOT NULL DEFAULT 24,
  "pendingApprovalHours" INTEGER NOT NULL DEFAULT 24,
  "crmHighPriorityLimit" INTEGER NOT NULL DEFAULT 10,
  "enableAppointmentAlerts" BOOLEAN NOT NULL DEFAULT true,
  "enableWaitingCustomerAlerts" BOOLEAN NOT NULL DEFAULT true,
  "enableStalledOsAlerts" BOOLEAN NOT NULL DEFAULT true,
  "enablePendingApprovalAlerts" BOOLEAN NOT NULL DEFAULT true,
  "enableCrmAlerts" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "operational_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operational_settings_tenantId_key" ON "operational_settings"("tenantId");

ALTER TABLE "operational_settings"
ADD CONSTRAINT "operational_settings_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
