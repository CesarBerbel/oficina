/** Tipo de categoria cadastrável. */
export const CategoryKind = {
  CUSTOMER: 'CUSTOMER',
  SERVICE: 'SERVICE',
  PART: 'PART',
} as const;

export type CategoryKind = (typeof CategoryKind)[keyof typeof CategoryKind];

export const CATEGORY_KINDS = Object.values(CategoryKind) as CategoryKind[];

export const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = {
  CUSTOMER: 'Clientes',
  SERVICE: 'Serviços',
  PART: 'Peças',
};
