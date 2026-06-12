-- Imagem padrão exibida nos cards de serviço da página pública (configurável).
ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "serviceCardImageUrl" TEXT;
