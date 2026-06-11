/** Nível do tanque de combustível no momento do check-in. */
export const FuelLevel = {
  EMPTY: 'EMPTY',
  QUARTER: 'QUARTER',
  HALF: 'HALF',
  THREE_QUARTERS: 'THREE_QUARTERS',
  FULL: 'FULL',
} as const;

export type FuelLevel = (typeof FuelLevel)[keyof typeof FuelLevel];

export const FUEL_LEVEL_LABELS: Record<FuelLevel, string> = {
  EMPTY: 'Vazio',
  QUARTER: '1/4',
  HALF: '1/2',
  THREE_QUARTERS: '3/4',
  FULL: 'Cheio',
};

export const FUEL_LEVELS = Object.values(FuelLevel) as FuelLevel[];

/** Resultado de um item do checklist de inspeção. */
export const ChecklistStatus = {
  OK: 'OK',
  ATENCAO: 'ATENCAO',
  FALHA: 'FALHA',
  NA: 'NA',
} as const;

export type ChecklistStatus =
  (typeof ChecklistStatus)[keyof typeof ChecklistStatus];

export const CHECKLIST_STATUS_LABELS: Record<ChecklistStatus, string> = {
  OK: 'OK',
  ATENCAO: 'Atenção',
  FALHA: 'Falha',
  NA: 'N/A',
};

export const CHECKLIST_STATUSES = Object.values(
  ChecklistStatus,
) as ChecklistStatus[];

/** Gravidade de uma avaria registrada na carroceria. */
export const DamageSeverity = {
  LEVE: 'LEVE',
  MODERADO: 'MODERADO',
  GRAVE: 'GRAVE',
} as const;

export type DamageSeverity =
  (typeof DamageSeverity)[keyof typeof DamageSeverity];

export const DAMAGE_SEVERITY_LABELS: Record<DamageSeverity, string> = {
  LEVE: 'Leve',
  MODERADO: 'Moderado',
  GRAVE: 'Grave',
};

export const DAMAGE_SEVERITIES = Object.values(
  DamageSeverity,
) as DamageSeverity[];

/**
 * Itens padrão do checklist de inspeção de entrada. O front pré-popula a
 * partir desta lista; o usuário marca o status e pode adicionar observações.
 */
export const DEFAULT_CHECKLIST_ITEMS: string[] = [
  'Pneus e estepe',
  'Faróis e lanternas',
  'Palhetas do limpador',
  'Buzina',
  'Nível de óleo',
  'Fluido de freio',
  'Água do radiador',
  'Bateria',
  'Ar-condicionado',
  'Painel sem avisos',
  'Documentos do veículo',
  'Itens pessoais retirados',
];
