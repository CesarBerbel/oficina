-- Pedidos de upgrade de plano: a conta solicita; o super admin aprova/atribui.

CREATE TABLE "plan_upgrade_requests" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "status" "AccountRequestStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "plan_upgrade_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "plan_upgrade_requests_status_idx" ON "plan_upgrade_requests"("status");
CREATE INDEX "plan_upgrade_requests_accountId_idx" ON "plan_upgrade_requests"("accountId");

ALTER TABLE "plan_upgrade_requests"
  ADD CONSTRAINT "plan_upgrade_requests_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_upgrade_requests"
  ADD CONSTRAINT "plan_upgrade_requests_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
