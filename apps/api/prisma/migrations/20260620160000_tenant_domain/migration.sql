-- Domínio próprio por oficina (resolução de tenant por host).
CREATE TABLE "tenant_domains" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_domains_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_domains_domain_key" ON "tenant_domains"("domain");
CREATE INDEX "tenant_domains_tenantId_idx" ON "tenant_domains"("tenantId");

ALTER TABLE "tenant_domains"
  ADD CONSTRAINT "tenant_domains_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
