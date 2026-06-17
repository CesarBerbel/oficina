-- Hierarquia matriz/filial e super usuário (gestão da plataforma).
ALTER TABLE "tenants" ADD COLUMN "parentId" TEXT;
ALTER TABLE "users" ADD COLUMN "superAdmin" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "tenants_parentId_idx" ON "tenants"("parentId");

ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "tenants"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
