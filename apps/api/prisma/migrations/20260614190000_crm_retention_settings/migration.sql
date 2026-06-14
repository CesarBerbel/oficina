CREATE TABLE "crm_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "reviewIntervalDays" INTEGER NOT NULL DEFAULT 180,
    "reviewIntervalKm" INTEGER NOT NULL DEFAULT 10000,
    "reviewKmWarning" INTEGER NOT NULL DEFAULT 1000,
    "inactiveCustomerDays" INTEGER NOT NULL DEFAULT 365,
    "postDeliveryStartDays" INTEGER NOT NULL DEFAULT 3,
    "postDeliveryEndDays" INTEGER NOT NULL DEFAULT 21,
    "refusedQuoteRecoveryDays" INTEGER NOT NULL DEFAULT 45,
    "refusedQuoteMinimumAgeDays" INTEGER NOT NULL DEFAULT 15,
    "highPriorityDays" INTEGER NOT NULL DEFAULT 365,
    "mediumPriorityDays" INTEGER NOT NULL DEFAULT 210,
    "enablePreventiveReview" BOOLEAN NOT NULL DEFAULT true,
    "enableKmReview" BOOLEAN NOT NULL DEFAULT true,
    "enableInactiveCustomers" BOOLEAN NOT NULL DEFAULT true,
    "enablePostDeliveryReturn" BOOLEAN NOT NULL DEFAULT true,
    "enableRefusedQuoteRecovery" BOOLEAN NOT NULL DEFAULT true,
    "enableRecommendedMaintenance" BOOLEAN NOT NULL DEFAULT true,
    "enableSeasonalCampaigns" BOOLEAN NOT NULL DEFAULT true,
    "recommendedMaintenanceKeywords" TEXT[] NOT NULL DEFAULT ARRAY['recomend', 'retornar', 'acompanhar', 'atenção', 'preventiva']::TEXT[],
    "seasonalCampaigns" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "crm_settings_tenantId_key" ON "crm_settings"("tenantId");

ALTER TABLE "crm_settings" ADD CONSTRAINT "crm_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
