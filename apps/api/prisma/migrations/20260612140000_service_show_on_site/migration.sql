-- Controla se o serviço aparece na página pública (site).
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "showOnSite" BOOLEAN NOT NULL DEFAULT true;
