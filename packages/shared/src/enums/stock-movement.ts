/** Tipos de movimentação de estoque. Toda mudança de saldo passa por aqui. */
export const StockMovementType = {
  ENTRADA: 'ENTRADA',
  SAIDA: 'SAIDA',
  AJUSTE: 'AJUSTE',
  CONSUMO_OS: 'CONSUMO_OS',
  COMPRA: 'COMPRA',
  ESTORNO: 'ESTORNO',
} as const;

export type StockMovementType = (typeof StockMovementType)[keyof typeof StockMovementType];

export const STOCK_MOVEMENT_LABELS: Record<StockMovementType, string> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  AJUSTE: 'Ajuste',
  CONSUMO_OS: 'Consumo em OS',
  COMPRA: 'Compra',
  ESTORNO: 'Estorno',
};

/** Sinal aplicado ao saldo por tipo de movimento (+1 entra, -1 sai). */
export const STOCK_MOVEMENT_SIGN: Record<StockMovementType, 1 | -1> = {
  ENTRADA: 1,
  SAIDA: -1,
  AJUSTE: 1, // o valor pode ser negativo no ajuste
  CONSUMO_OS: -1,
  COMPRA: 1,
  ESTORNO: 1,
};
