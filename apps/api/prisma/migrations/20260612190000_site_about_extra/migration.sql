-- Texto complementar do "Sobre" (mostrado abaixo do resumo na página Sobre).
ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "aboutExtra" TEXT;
