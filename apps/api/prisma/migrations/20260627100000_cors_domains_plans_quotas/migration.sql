-- CORS/domínios customizados completos + planos/quotas SaaS

CREATE TYPE "TenantDomainStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');
CREATE TYPE "PlanBillingInterval" AS ENUM ('MONTHLY', 'YEARLY');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');
CREATE TYPE "PlanFeatureKey" AS ENUM (
  'USERS',
  'BRANCHES',
  'SERVICE_ORDERS_MONTH',
  'UPLOADS_MONTH',
  'STORAGE_MB',
  'AI_MONTH',
  'MESSAGES_MONTH',
  'CUSTOM_DOMAINS'
);

ALTER TABLE "tenant_domains"
  ADD COLUMN "status" "TenantDomainStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "lastCheckedAt" TIMESTAMP(3),
  ADD COLUMN "lastCheckError" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "tenant_domains" SET "status" = 'VERIFIED' WHERE "verifiedAt" IS NOT NULL;

-- Garante apenas um primário por tenant antes do índice parcial. Mantém o mais antigo.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "tenant_domains"
  WHERE "isPrimary" = true
)
UPDATE "tenant_domains" d
SET "isPrimary" = false
FROM ranked r
WHERE d."id" = r."id" AND r.rn > 1;

CREATE INDEX "tenant_domains_status_idx" ON "tenant_domains"("status");
CREATE UNIQUE INDEX "tenant_domains_one_primary_per_tenant_idx"
  ON "tenant_domains"("tenantId") WHERE "isPrimary" = true;

CREATE TABLE "plans" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "priceCents" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "billingInterval" "PlanBillingInterval" NOT NULL DEFAULT 'MONTHLY',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

CREATE TABLE "plan_feature_limits" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "feature" "PlanFeatureKey" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "limit" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plan_feature_limits_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "plan_feature_limits_planId_feature_key" ON "plan_feature_limits"("planId", "feature");
CREATE INDEX "plan_feature_limits_feature_idx" ON "plan_feature_limits"("feature");
ALTER TABLE "plan_feature_limits" ADD CONSTRAINT "plan_feature_limits_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "account_subscriptions" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "trialEndsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "account_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "account_subscriptions_accountId_status_idx" ON "account_subscriptions"("accountId", "status");
CREATE INDEX "account_subscriptions_planId_idx" ON "account_subscriptions"("planId");
ALTER TABLE "account_subscriptions" ADD CONSTRAINT "account_subscriptions_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "account_subscriptions" ADD CONSTRAINT "account_subscriptions_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "account_usage_counters" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "feature" "PlanFeatureKey" NOT NULL,
  "period" TEXT NOT NULL,
  "used" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "account_usage_counters_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "account_usage_counters_accountId_feature_period_key" ON "account_usage_counters"("accountId", "feature", "period");
CREATE INDEX "account_usage_counters_feature_period_idx" ON "account_usage_counters"("feature", "period");
ALTER TABLE "account_usage_counters" ADD CONSTRAINT "account_usage_counters_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "accounts" ADD COLUMN "planId" TEXT;
CREATE INDEX "accounts_planId_idx" ON "accounts"("planId");
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Plano padrão de bootstrap para instalações existentes; limits conservadores, editáveis pelo painel.
INSERT INTO "plans" ("id", "code", "name", "description", "active", "priceCents", "currency", "billingInterval")
VALUES ('plan_starter_default', 'starter', 'Starter', 'Plano inicial padrão para oficinas pequenas.', true, 0, 'BRL', 'MONTHLY')
ON CONFLICT ("code") DO NOTHING;

WITH starter AS (SELECT "id" AS "planId" FROM "plans" WHERE "code" = 'starter' LIMIT 1)
INSERT INTO "plan_feature_limits" ("id", "planId", "feature", "enabled", "limit")
SELECT 'pfl_starter_users', "planId", 'USERS'::"PlanFeatureKey", true, 5 FROM starter
UNION ALL SELECT 'pfl_starter_branches', "planId", 'BRANCHES'::"PlanFeatureKey", true, 1 FROM starter
UNION ALL SELECT 'pfl_starter_os', "planId", 'SERVICE_ORDERS_MONTH'::"PlanFeatureKey", true, 300 FROM starter
UNION ALL SELECT 'pfl_starter_uploads', "planId", 'UPLOADS_MONTH'::"PlanFeatureKey", true, 500 FROM starter
UNION ALL SELECT 'pfl_starter_storage', "planId", 'STORAGE_MB'::"PlanFeatureKey", true, 10240 FROM starter
UNION ALL SELECT 'pfl_starter_ai', "planId", 'AI_MONTH'::"PlanFeatureKey", true, 300 FROM starter
UNION ALL SELECT 'pfl_starter_messages', "planId", 'MESSAGES_MONTH'::"PlanFeatureKey", true, 1000 FROM starter
UNION ALL SELECT 'pfl_starter_domains', "planId", 'CUSTOM_DOMAINS'::"PlanFeatureKey", true, 2 FROM starter
ON CONFLICT ("planId", "feature") DO NOTHING;

UPDATE "accounts"
SET "planId" = (SELECT "id" FROM "plans" WHERE "code" = 'starter' LIMIT 1),
    "plan" = COALESCE("plan", 'starter')
WHERE "planId" IS NULL;

INSERT INTO "account_subscriptions" ("id", "accountId", "planId", "status", "currentPeriodStart")
SELECT 'sub_' || a."id", a."id", COALESCE(a."planId", (SELECT "id" FROM "plans" WHERE "code" = 'starter' LIMIT 1)), 'ACTIVE', CURRENT_TIMESTAMP
FROM "accounts" a
WHERE NOT EXISTS (
  SELECT 1 FROM "account_subscriptions" s
  WHERE s."accountId" = a."id" AND s."status" IN ('TRIALING', 'ACTIVE', 'PAST_DUE')
);
