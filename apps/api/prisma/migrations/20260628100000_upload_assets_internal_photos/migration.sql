-- Rastreio de uploads por tenant para ownership e bloqueio de URLs externas em fotos.

CREATE TABLE "upload_assets" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "createdById" TEXT,
  "filename" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "extension" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "upload_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "upload_assets_filename_key" ON "upload_assets"("filename");
CREATE UNIQUE INDEX "upload_assets_path_key" ON "upload_assets"("path");
CREATE UNIQUE INDEX "upload_assets_url_key" ON "upload_assets"("url");
CREATE INDEX "upload_assets_tenantId_createdAt_idx" ON "upload_assets"("tenantId", "createdAt");
CREATE INDEX "upload_assets_createdById_idx" ON "upload_assets"("createdById");

ALTER TABLE "upload_assets" ADD CONSTRAINT "upload_assets_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "upload_assets" ADD CONSTRAINT "upload_assets_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
