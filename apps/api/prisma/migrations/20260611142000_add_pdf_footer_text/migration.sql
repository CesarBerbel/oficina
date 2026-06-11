-- Add configurable PDF footer text.
ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "pdfFooterText" TEXT;
