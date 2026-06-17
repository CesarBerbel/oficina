-- Índices de busca por similaridade (substring/ILIKE) usando pg_trgm.
-- Aceleram os filtros `contains` (ILIKE '%termo%') das listagens, que não
-- conseguem usar índices btree por causa do curinga à esquerda.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Clientes (busca por nome, documento, e-mail, telefone, whatsapp, cidade)
CREATE INDEX IF NOT EXISTS "customers_name_trgm_idx" ON "customers" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "customers_document_trgm_idx" ON "customers" USING gin ("document" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "customers_email_trgm_idx" ON "customers" USING gin ("email" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "customers_phone_trgm_idx" ON "customers" USING gin ("phone" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "customers_whatsapp_trgm_idx" ON "customers" USING gin ("whatsapp" gin_trgm_ops);

-- Veículos (busca por placa, fabricante, modelo)
CREATE INDEX IF NOT EXISTS "vehicles_plate_trgm_idx" ON "vehicles" USING gin ("plate" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "vehicles_manufacturer_trgm_idx" ON "vehicles" USING gin ("manufacturer" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "vehicles_model_trgm_idx" ON "vehicles" USING gin ("model" gin_trgm_ops);

-- Peças (busca por nome, SKU, marca, NCM, EAN)
CREATE INDEX IF NOT EXISTS "parts_name_trgm_idx" ON "parts" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "parts_sku_trgm_idx" ON "parts" USING gin ("sku" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "parts_brand_trgm_idx" ON "parts" USING gin ("brand" gin_trgm_ops);

-- Serviços e fornecedores (busca por nome)
CREATE INDEX IF NOT EXISTS "services_name_trgm_idx" ON "services" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "suppliers_name_trgm_idx" ON "suppliers" USING gin ("name" gin_trgm_ops);

-- Usuários (busca por nome e e-mail)
CREATE INDEX IF NOT EXISTS "users_name_trgm_idx" ON "users" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "users_email_trgm_idx" ON "users" USING gin ("email" gin_trgm_ops);
