-- Imagem padrão dos artigos do blog (configurável no painel do site).
ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "blogFallbackImageUrl" TEXT;
