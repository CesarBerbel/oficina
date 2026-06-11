/** Indicadores do dashboard. */
export interface DashboardMetrics {
  osOpen: number; // OS ativas (não terminais)
  osEntrada: number;
  osDiagnosis: number;
  osAwaitingApproval: number; // em ORCAMENTO
  osApproved: number;
  osInExecution: number;
  osInTest: number;
  osReady: number; // PRONTA + PRONTO_RETIRAR
  osOverdue: number;
  lowStock: number;
  pendingPurchases: number;
  openQuotes: number; // orçamentos enviados sem resposta
  leads: number; // site (fase 8)
  pendingMessages: number; // mensageria (fase 8)
}

export type ActionPriority = 'alta' | 'media' | 'baixa';

export interface ActionItem {
  key: string;
  type: string;
  title: string;
  description: string;
  priority: ActionPriority;
  count: number;
  link: string;
  /** Idade da pendência mais antiga, em horas. */
  ageHours: number | null;
}
