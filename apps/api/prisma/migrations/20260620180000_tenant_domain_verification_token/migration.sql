-- Token de verificação por DNS dos domínios próprios.
ALTER TABLE "tenant_domains" ADD COLUMN "verificationToken" TEXT;

-- Backfill de linhas existentes com um token aleatório.
UPDATE "tenant_domains"
SET "verificationToken" = replace(gen_random_uuid()::text, '-', '')
WHERE "verificationToken" IS NULL;

ALTER TABLE "tenant_domains" ALTER COLUMN "verificationToken" SET NOT NULL;
