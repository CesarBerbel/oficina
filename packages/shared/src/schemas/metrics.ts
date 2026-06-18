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

/** Uso da IA na janela atual (dia/mês UTC). */
export interface AiMetricsDto {
  usageToday: number;
  usageMonth: number;
  failuresToday: number;
  lastError: string | null;
}

/** Estado do envio de e-mail. */
export interface SmtpMetricsDto {
  driver: string; // 'smtp' | 'log'
  configured: boolean; // smtp: host/usuário presentes; log: sempre true
}

/** Último backup conhecido (heartbeat gravado pelo scripts/backup.sh). */
export interface BackupMetricsDto {
  lastAt: string | null;
  ageHours: number | null;
  maxAgeHours: number;
  ok: boolean; // existe e mais novo que maxAgeHours
}

/** Saúde de infraestrutura. */
export interface HealthMetricsDto {
  dbOk: boolean;
}

export type MetricAlertLevel = 'warn' | 'critical';
export type MetricAlertSource = 'outbox' | 'smtp' | 'backup' | 'ai' | 'health';

export interface MetricAlert {
  level: MetricAlertLevel;
  source: MetricAlertSource;
  message: string;
}

export interface SystemMetricsDto {
  outbox: OutboxMetricsDto;
  ledger: LedgerMetricsDto;
  ai: AiMetricsDto;
  smtp: SmtpMetricsDto;
  backup: BackupMetricsDto;
  health: HealthMetricsDto;
  /** Condições que merecem atenção operacional (derivadas das métricas). */
  alerts: MetricAlert[];
}
