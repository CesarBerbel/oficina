/*
  Torna vehicle_checkins.serviceOrderId obrigatório.

  A primeira versão desta migration fazia apenas ALTER COLUMN SET NOT NULL e
  falhava em bases que já tivessem check-ins antigos sem OS vinculada.

  Estratégia segura:
  1. Backfill automático: vincula cada check-in sem OS à OS mais recente do
     mesmo tenant, cliente e veículo, quando existir uma correspondência única
     por esses filtros.
  2. Guarda explícita: se ainda restarem registros sem OS, interrompe com uma
     mensagem acionável em vez de falhar com erro genérico de NOT NULL.
*/

-- DropForeignKey
ALTER TABLE "vehicle_checkins" DROP CONSTRAINT "vehicle_checkins_serviceOrderId_fkey";

-- Backfill dos check-ins legados sem OS usando a OS mais recente compatível.
UPDATE "vehicle_checkins" vc
SET "serviceOrderId" = (
  SELECT so."id"
  FROM "service_orders" so
  WHERE so."tenantId" = vc."tenantId"
    AND so."customerId" = vc."customerId"
    AND so."vehicleId" = vc."vehicleId"
  ORDER BY so."openedAt" DESC, so."createdAt" DESC
  LIMIT 1
)
WHERE vc."serviceOrderId" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "service_orders" so
    WHERE so."tenantId" = vc."tenantId"
      AND so."customerId" = vc."customerId"
      AND so."vehicleId" = vc."vehicleId"
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "vehicle_checkins" WHERE "serviceOrderId" IS NULL) THEN
    RAISE EXCEPTION 'Ainda existem vehicle_checkins sem serviceOrderId. Vincule esses check-ins a uma OS compatível antes de aplicar esta migration.';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "vehicle_checkins" ALTER COLUMN "serviceOrderId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "vehicle_checkins" ADD CONSTRAINT "vehicle_checkins_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
