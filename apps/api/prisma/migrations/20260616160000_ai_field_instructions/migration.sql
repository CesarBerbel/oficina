-- Instruções de IA específicas por campo (mapa campo → instrução).
ALTER TABLE "ai_configs" ADD COLUMN "fieldInstructions" JSONB;
