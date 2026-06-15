export const FinancialEntryType = {
  RECEIVABLE: 'RECEIVABLE',
  PAYABLE: 'PAYABLE',
} as const;
export type FinancialEntryType = (typeof FinancialEntryType)[keyof typeof FinancialEntryType];
export const FINANCIAL_ENTRY_TYPE_LABELS: Record<FinancialEntryType, string> = {
  RECEIVABLE: 'Conta a receber',
  PAYABLE: 'Conta a pagar',
};
export const FINANCIAL_ENTRY_TYPES = Object.values(FinancialEntryType) as FinancialEntryType[];

export const FinancialEntryStatus = {
  OPEN: 'OPEN',
  PARTIAL: 'PARTIAL',
  PAID: 'PAID',
  CANCELED: 'CANCELED',
} as const;
export type FinancialEntryStatus = (typeof FinancialEntryStatus)[keyof typeof FinancialEntryStatus];
export const FINANCIAL_ENTRY_STATUS_LABELS: Record<FinancialEntryStatus, string> = {
  OPEN: 'Aberto',
  PARTIAL: 'Parcial',
  PAID: 'Pago',
  CANCELED: 'Cancelado',
};
export const FINANCIAL_ENTRY_STATUSES = Object.values(FinancialEntryStatus) as FinancialEntryStatus[];

export const FinancialPaymentMethod = {
  DINHEIRO: 'DINHEIRO',
  PIX: 'PIX',
  CARTAO_DEBITO: 'CARTAO_DEBITO',
  CARTAO_CREDITO: 'CARTAO_CREDITO',
  BOLETO: 'BOLETO',
  TRANSFERENCIA: 'TRANSFERENCIA',
  CHEQUE: 'CHEQUE',
  OUTRO: 'OUTRO',
} as const;
export type FinancialPaymentMethod = (typeof FinancialPaymentMethod)[keyof typeof FinancialPaymentMethod];
export const FINANCIAL_PAYMENT_METHOD_LABELS: Record<FinancialPaymentMethod, string> = {
  DINHEIRO: 'Dinheiro',
  PIX: 'PIX',
  CARTAO_DEBITO: 'Cartão de débito',
  CARTAO_CREDITO: 'Cartão de crédito',
  BOLETO: 'Boleto',
  TRANSFERENCIA: 'Transferência',
  CHEQUE: 'Cheque',
  OUTRO: 'Outro',
};
export const FINANCIAL_PAYMENT_METHODS = Object.values(FinancialPaymentMethod) as FinancialPaymentMethod[];

export const FinancialEntryOrigin = {
  MANUAL: 'MANUAL',
  SERVICE_ORDER: 'SERVICE_ORDER',
  PURCHASE_ORDER: 'PURCHASE_ORDER',
} as const;
export type FinancialEntryOrigin = (typeof FinancialEntryOrigin)[keyof typeof FinancialEntryOrigin];
export const FINANCIAL_ENTRY_ORIGIN_LABELS: Record<FinancialEntryOrigin, string> = {
  MANUAL: 'Manual',
  SERVICE_ORDER: 'Ordem de Serviço',
  PURCHASE_ORDER: 'Pedido de compra',
};
