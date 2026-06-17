/** Métricas do outbox de mensagens (saúde da entrega assíncrona). */
export interface OutboxMetricsDto {
  byStatus: {
    pending: number;
    processing: number;
    done: number;
    failed: number;
  };
  /** Pendentes já elegíveis para processamento (availableAt <= agora). */
  pendingDue: number;
  /** Idade do pendente mais antigo, em segundos (null se não houver). */
  oldestPendingAgeSec: number | null;
  /** Falhas definitivas recentes (para inspeção). */
  failures: Array<{
    id: string;
    type: string;
    attempts: number;
    lastError: string | null;
    createdAt: string;
  }>;
}

/** Métricas do ledger financeiro (saldo devido derivado dos movimentos). */
export interface LedgerMetricsDto {
  movements: number;
  totalIssued: number;
  totalPaid: number;
  totalCanceled: number;
  /** Saldo em aberto = soma assinada dos movimentos. */
  outstanding: number;
}

export interface SystemMetricsDto {
  outbox: OutboxMetricsDto;
  ledger: LedgerMetricsDto;
}
