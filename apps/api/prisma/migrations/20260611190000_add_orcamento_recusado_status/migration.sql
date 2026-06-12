-- Novo status: orçamento recusado pelo cliente (permite gerar um novo orçamento).
ALTER TYPE "ServiceOrderStatus" ADD VALUE IF NOT EXISTS 'ORCAMENTO_RECUSADO' AFTER 'ORCAMENTO_APROVADO';
