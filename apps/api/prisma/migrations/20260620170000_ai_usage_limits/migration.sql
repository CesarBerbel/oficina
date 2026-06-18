-- Limites de uso de IA por tenant (null = ilimitado).
ALTER TABLE "ai_configs" ADD COLUMN "dailyLimit" INTEGER;
ALTER TABLE "ai_configs" ADD COLUMN "monthlyLimit" INTEGER;
ALTER TABLE "ai_configs" ADD COLUMN "perUserDailyLimit" INTEGER;

-- Acelera a contagem de uso por janela (tenant + período) e por usuário.
CREATE INDEX IF NOT EXISTS "ai_usage_logs_tenantId_userId_createdAt_idx"
  ON "ai_usage_logs" ("tenantId", "userId", "createdAt");
