/** Tipo do item de estoque. */
export const PartType = {
  PECA: 'PECA',
  INSUMO: 'INSUMO',
} as const;

export type PartType = (typeof PartType)[keyof typeof PartType];

export const PART_TYPE_LABELS: Record<PartType, string> = {
  PECA: 'Peça',
  INSUMO: 'Insumo',
};

export const PART_TYPES = Object.values(PartType) as PartType[];
