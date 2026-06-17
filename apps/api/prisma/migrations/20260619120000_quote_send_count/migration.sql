-- Contador de envios do orçamento (reenvios exigem motivo).
ALTER TABLE "quotes" ADD COLUMN "sendCount" INTEGER NOT NULL DEFAULT 0;

-- Orçamentos já existentes: considera que foram enviados ao menos uma vez.
UPDATE "quotes" SET "sendCount" = 1;
