-- Permite cadastrar marcas de peças em Configurações > Categorias e marcas.
ALTER TYPE "CategoryKind" ADD VALUE 'BRAND';

-- NCM fiscal da peça, usado em NF-e e relatórios fiscais.
ALTER TABLE "parts" ADD COLUMN "ncm" TEXT;
