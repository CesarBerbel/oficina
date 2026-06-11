/** Tipo de item da OS. Combos são expandidos em itens SERVICE/PART agrupados. */
export const ServiceOrderItemKind = {
  SERVICE: 'SERVICE',
  PART: 'PART',
} as const;

export type ServiceOrderItemKind =
  (typeof ServiceOrderItemKind)[keyof typeof ServiceOrderItemKind];

export const SERVICE_ORDER_ITEM_KIND_LABELS: Record<
  ServiceOrderItemKind,
  string
> = {
  SERVICE: 'Serviço',
  PART: 'Peça',
};
