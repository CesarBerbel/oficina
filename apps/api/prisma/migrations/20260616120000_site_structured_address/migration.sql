-- Endereço estruturado da oficina (mantém `address` como versão composta para exibição).
ALTER TABLE "site_settings"
  ADD COLUMN "addressZip" TEXT,
  ADD COLUMN "addressStreet" TEXT,
  ADD COLUMN "addressNumber" TEXT,
  ADD COLUMN "addressComplement" TEXT,
  ADD COLUMN "addressDistrict" TEXT,
  ADD COLUMN "addressCity" TEXT,
  ADD COLUMN "addressState" TEXT;
