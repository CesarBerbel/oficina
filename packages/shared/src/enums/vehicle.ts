/** Tipo de combustível do veículo. */
export const FuelType = {
  GASOLINA: 'GASOLINA',
  ETANOL: 'ETANOL',
  FLEX: 'FLEX',
  DIESEL: 'DIESEL',
  GNV: 'GNV',
  ELETRICO: 'ELETRICO',
  HIBRIDO: 'HIBRIDO',
} as const;

export type FuelType = (typeof FuelType)[keyof typeof FuelType];

export const FUEL_TYPE_LABELS: Record<FuelType, string> = {
  GASOLINA: 'Gasolina',
  ETANOL: 'Etanol',
  FLEX: 'Flex',
  DIESEL: 'Diesel',
  GNV: 'GNV',
  ELETRICO: 'Elétrico',
  HIBRIDO: 'Híbrido',
};

export const FUEL_TYPES = Object.values(FuelType) as FuelType[];

/** Tipo de câmbio. */
export const TransmissionType = {
  MANUAL: 'MANUAL',
  AUTOMATICO: 'AUTOMATICO',
  AUTOMATIZADO: 'AUTOMATIZADO',
  CVT: 'CVT',
} as const;

export type TransmissionType = (typeof TransmissionType)[keyof typeof TransmissionType];

export const TRANSMISSION_LABELS: Record<TransmissionType, string> = {
  MANUAL: 'Manual',
  AUTOMATICO: 'Automático',
  AUTOMATIZADO: 'Automatizado',
  CVT: 'CVT',
};

export const TRANSMISSION_TYPES = Object.values(TransmissionType) as TransmissionType[];
