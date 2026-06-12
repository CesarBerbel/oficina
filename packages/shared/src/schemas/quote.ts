import { z } from 'zod';
import { ServiceOrderItemKind } from '../enums/service-order-item.js';
import {
  QuoteDecisionType,
  QuoteItemDecision,
  QuoteStatus,
} from '../enums/quote.js';
import { cpfCnpjSchema } from './common.js';

/** Observações públicas exibidas ao cliente no orçamento. */
export const generateQuoteSchema = z.object({
  publicNotes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
});
export type GenerateQuoteInput = z.infer<typeof generateQuoteSchema>;

/** Decisão do cliente (página pública). */
export const quoteDecisionSchema = z.object({
  /** Decisões por item; ausência = item aprovado por padrão na aprovação total. */
  itemDecisions: z
    .array(
      z.object({
        itemId: z.string().min(1),
        decision: z.enum([
          QuoteItemDecision.APROVADO,
          QuoteItemDecision.RECUSADO,
        ]),
      }),
    )
    .default([]),
  /** Recusa total do orçamento. */
  reject: z.boolean().default(false),
  /** Assinatura digital simples — nome do responsável (obrigatório). */
  signatureName: z
    .string()
    .trim()
    .min(1, 'Informe seu nome completo')
    .max(160),
  /** Documento do responsável — CPF ou CNPJ válido (obrigatório). */
  signatureDoc: cpfCnpjSchema.refine((v): v is string => v !== null, {
    message: 'Informe um CPF ou CNPJ válido',
  }),
});
export type QuoteDecisionInput = z.infer<typeof quoteDecisionSchema>;

export interface QuoteItemDto {
  id: string;
  kind: ServiceOrderItemKind;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  decision: QuoteItemDecision;
  /** Item de serviço ao qual esta peça está vinculada (cascata da decisão). */
  parentItemId: string | null;
}

export interface QuoteDto {
  id: string;
  status: QuoteStatus;
  token: string;
  publicNotes: string | null;
  totalServices: number;
  totalParts: number;
  discount: number;
  total: number;
  items: QuoteItemDto[];
  decisionType: QuoteDecisionType | null;
  decidedAt: string | null;
  decisionIp: string | null;
  signatureName: string | null;
  signatureDoc: string | null;
  createdAt: string;
}
