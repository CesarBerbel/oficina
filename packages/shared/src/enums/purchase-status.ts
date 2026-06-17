/** Status do pedido de compra. */
export const PurchaseOrderStatus = {
  ABERTO: 'ABERTO',
  ENVIADO: 'ENVIADO',
  PARCIALMENTE_RECEBIDO: 'PARCIALMENTE_RECEBIDO',
  RECEBIDO: 'RECEBIDO',
  CANCELADO: 'CANCELADO',
} as const;

export type PurchaseOrderStatus = (typeof PurchaseOrderStatus)[keyof typeof PurchaseOrderStatus];

export const PURCHASE_ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  ABERTO: 'Aberto',
  ENVIADO: 'Enviado',
  PARCIALMENTE_RECEBIDO: 'Parcialmente recebido',
  RECEBIDO: 'Recebido',
  CANCELADO: 'Cancelado',
};
