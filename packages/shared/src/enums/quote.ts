/** Status do orçamento e das decisões do cliente. */
export const QuoteStatus = {
  RASCUNHO: 'RASCUNHO',
  ENVIADO: 'ENVIADO',
  APROVADO: 'APROVADO',
  APROVADO_PARCIAL: 'APROVADO_PARCIAL',
  RECUSADO: 'RECUSADO',
} as const;

export type QuoteStatus = (typeof QuoteStatus)[keyof typeof QuoteStatus];

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  RASCUNHO: 'Rascunho',
  ENVIADO: 'Enviado',
  APROVADO: 'Aprovado',
  APROVADO_PARCIAL: 'Aprovado parcialmente',
  RECUSADO: 'Recusado',
};

export const QuoteItemDecision = {
  PENDENTE: 'PENDENTE',
  APROVADO: 'APROVADO',
  RECUSADO: 'RECUSADO',
} as const;

export type QuoteItemDecision = (typeof QuoteItemDecision)[keyof typeof QuoteItemDecision];

/** Tipo da decisão do cliente sobre o orçamento. */
export const QuoteDecisionType = {
  TOTAL: 'TOTAL',
  PARCIAL: 'PARCIAL',
  RECUSA: 'RECUSA',
} as const;

export type QuoteDecisionType = (typeof QuoteDecisionType)[keyof typeof QuoteDecisionType];
