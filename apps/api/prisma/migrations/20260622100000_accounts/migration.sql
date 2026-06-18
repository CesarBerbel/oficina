-- Conta do cliente (SaaS): dona de uma ou mais oficinas (matriz + filiais).

-- Enum de status da conta.
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'PENDING', 'SUSPENDED');

-- Tabela de contas.
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "plan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "accounts_slug_key" ON "accounts"("slug");

-- accountId nas oficinas (nullable durante o backfill).
ALTER TABLE "tenants" ADD COLUMN "accountId" TEXT;

-- Backfill: uma conta por matriz (parentId IS NULL), reaproveitando nome/slug.
INSERT INTO "accounts" ("id", "name", "slug", "status", "createdAt", "updatedAt")
SELECT 'acc_' || t."id", t."name", t."slug", 'ACTIVE', now(), now()
FROM "tenants" t
WHERE t."parentId" IS NULL;

-- Matriz aponta para a própria conta.
UPDATE "tenants" t
SET "accountId" = 'acc_' || t."id"
WHERE t."parentId" IS NULL;

-- Filiais herdam a conta da matriz.
UPDATE "tenants" t
SET "accountId" = 'acc_' || t."parentId"
WHERE t."parentId" IS NOT NULL;

-- Agora torna obrigatório + FK + índice.
ALTER TABLE "tenants" ALTER COLUMN "accountId" SET NOT NULL;
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "tenants_accountId_idx" ON "tenants"("accountId");
