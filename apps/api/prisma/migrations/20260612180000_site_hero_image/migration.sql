-- Imagem de fundo do hero (topo) da home pública.
ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "heroImageUrl" TEXT;
