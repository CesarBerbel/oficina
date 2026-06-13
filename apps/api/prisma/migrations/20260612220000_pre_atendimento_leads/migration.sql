ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'CONTATO_REALIZADO';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'RETORNAR_DEPOIS';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'AGENDADO';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'PERDIDO';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'DUPLICADO';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'INVALIDO';

CREATE TYPE "LeadContactChannel" AS ENUM ('TELEFONE', 'WHATSAPP', 'EMAIL', 'PRESENCIAL');
CREATE TYPE "LeadContactOutcome" AS ENUM ('ATENDEU', 'NAO_ATENDEU', 'TELEFONE_INCORRETO', 'CHAMAR_WHATSAPP', 'PEDIU_RETORNO', 'AGENDOU_VISITA', 'SEM_INTERESSE', 'JA_RESOLVEU', 'ORCAMENTO_ENVIADO', 'CONVERTIDO_OS');
CREATE TYPE "LeadConflictLevel" AS ENUM ('OK', 'ATENCAO', 'CONFLITO', 'SEM_DADOS');

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "plate" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "assignedToId" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "assignedToName" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "matchedCustomerId" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "matchedVehicleId" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "convertedCustomerId" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "convertedVehicleId" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "convertedServiceOrderId" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "conflictLevel" "LeadConflictLevel" NOT NULL DEFAULT 'SEM_DADOS';
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "conflictReason" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "nextFollowUpAt" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "convertedAt" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);

CREATE TABLE "lead_contact_attempts" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "userId" TEXT,
  "userName" TEXT,
  "channel" "LeadContactChannel" NOT NULL,
  "outcome" "LeadContactOutcome" NOT NULL,
  "notes" TEXT,
  "nextFollowUpAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_contact_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lead_events" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "userId" TEXT,
  "userName" TEXT,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "leads_tenantId_plate_idx" ON "leads"("tenantId", "plate");
CREATE INDEX "leads_tenantId_nextFollowUpAt_idx" ON "leads"("tenantId", "nextFollowUpAt");
CREATE INDEX "leads_tenantId_matchedCustomerId_idx" ON "leads"("tenantId", "matchedCustomerId");
CREATE INDEX "lead_contact_attempts_tenantId_leadId_createdAt_idx" ON "lead_contact_attempts"("tenantId", "leadId", "createdAt");
CREATE INDEX "lead_contact_attempts_tenantId_nextFollowUpAt_idx" ON "lead_contact_attempts"("tenantId", "nextFollowUpAt");
CREATE INDEX "lead_events_tenantId_leadId_createdAt_idx" ON "lead_events"("tenantId", "leadId", "createdAt");
CREATE INDEX "lead_events_tenantId_type_idx" ON "lead_events"("tenantId", "type");

ALTER TABLE "lead_contact_attempts" ADD CONSTRAINT "lead_contact_attempts_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
