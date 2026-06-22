-- DropIndex
DROP INDEX "ai_usage_logs_tenantId_userId_createdAt_idx";

-- DropIndex
DROP INDEX "customers_document_trgm_idx";

-- DropIndex
DROP INDEX "customers_email_trgm_idx";

-- DropIndex
DROP INDEX "customers_name_trgm_idx";

-- DropIndex
DROP INDEX "customers_phone_trgm_idx";

-- DropIndex
DROP INDEX "customers_whatsapp_trgm_idx";

-- DropIndex
DROP INDEX "parts_brand_trgm_idx";

-- DropIndex
DROP INDEX "parts_name_trgm_idx";

-- DropIndex
DROP INDEX "parts_sku_trgm_idx";

-- DropIndex
DROP INDEX "services_name_trgm_idx";

-- DropIndex
DROP INDEX "suppliers_name_trgm_idx";

-- DropIndex
DROP INDEX "tenants_parentId_idx";

-- DropIndex
DROP INDEX "users_email_trgm_idx";

-- DropIndex
DROP INDEX "users_name_trgm_idx";

-- DropIndex
DROP INDEX "vehicles_manufacturer_trgm_idx";

-- DropIndex
DROP INDEX "vehicles_model_trgm_idx";

-- DropIndex
DROP INDEX "vehicles_plate_trgm_idx";

-- AlterTable
ALTER TABLE "account_subscriptions" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "account_usage_counters" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "accounting_accounts" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "leads" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "plan_feature_limits" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "plans" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "darkMode" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "tenant_domains" ALTER COLUMN "updatedAt" DROP DEFAULT;
