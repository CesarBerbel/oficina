-- Liga cada item do orçamento ao item da OS que o originou, para remover da OS
-- os itens recusados quando o cliente aprova o orçamento parcialmente.
ALTER TABLE "quote_items" ADD COLUMN IF NOT EXISTS "serviceOrderItemId" TEXT;
