/** Tipo de cliente: pessoa física ou jurídica. */
export const CustomerType = {
  PF: 'PF',
  PJ: 'PJ',
} as const;

export type CustomerType = (typeof CustomerType)[keyof typeof CustomerType];

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  PF: 'Pessoa Física',
  PJ: 'Pessoa Jurídica',
};
