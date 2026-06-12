-- Documento (CPF/CNPJ) do responsável que aprovou/recusou o orçamento.
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "signatureDoc" TEXT;
