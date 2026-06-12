-- Categorias cadastráveis por tipo (cliente, serviço, peça).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "CategoryKind" AS ENUM ('CUSTOMER', 'SERVICE', 'PART');

CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "CategoryKind" NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "categories_tenantId_kind_name_key" ON "categories"("tenantId", "kind", "name");
CREATE INDEX "categories_tenantId_kind_idx" ON "categories"("tenantId", "kind");

ALTER TABLE "categories" ADD CONSTRAINT "categories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migra categorias de cliente das configurações do site.
INSERT INTO "categories" ("id", "tenantId", "kind", "name", "active", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, s."tenantId", 'CUSTOMER', cat, true, now(), now()
FROM "site_settings" s, unnest(s."customerCategories") AS cat
WHERE cat IS NOT NULL AND btrim(cat) <> ''
ON CONFLICT DO NOTHING;

-- Migra categorias existentes de serviços (texto livre) para o cadastro.
INSERT INTO "categories" ("id", "tenantId", "kind", "name", "active", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, v."tenantId", 'SERVICE', v.category, true, now(), now()
FROM (SELECT DISTINCT "tenantId", category FROM "services" WHERE category IS NOT NULL AND btrim(category) <> '') v
ON CONFLICT DO NOTHING;

-- Migra categorias existentes de peças (texto livre) para o cadastro.
INSERT INTO "categories" ("id", "tenantId", "kind", "name", "active", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, v."tenantId", 'PART', v.category, true, now(), now()
FROM (SELECT DISTINCT "tenantId", category FROM "parts" WHERE category IS NOT NULL AND btrim(category) <> '') v
ON CONFLICT DO NOTHING;

-- Remove a gestão de categorias de cliente das configurações do site.
ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "customerCategories";
