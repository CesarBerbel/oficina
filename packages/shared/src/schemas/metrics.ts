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

/** Estado exibido na página de backup do super admin. */
export interface BackupStatusDto {
  /** Último backup agendado conhecido (heartbeat gravado pelo scripts/backup.sh). */
  heartbeat: BackupMetricsDto;
  /** Tamanho atual do banco (bytes), via pg_database_size. */
  dbSizeBytes: number;
  /** Quantidade de tabelas que entram no dump (exclui _prisma_migrations). */
  tableCount: number;
  /** Arquivos de upload que serão incluídos no backup. */
  uploads: { fileCount: number; sizeBytes: number };
}

export interface SessionMetricsDto {
  active: number;
  expiring24h: number;
  usersOnline: number;
}

export interface StockOpsMetricsDto {
  activeReservations: number;
  reservedParts: number;
  lowStockParts: number;
  reorderSuggestions: number;
}

export interface FinanceOpsMetricsDto {
  openReceivables: number;
  openPayables: number;
  overdueReceivables: number;
  overduePayables: number;
  reversedPayments: number;
}

export type MetricAlertLevel = 'warn' | 'critical';
export type MetricAlertSource =
  | 'outbox'
  | 'smtp'
  | 'backup'
  | 'ai'
  | 'health'
  | 'sessions'
  | 'stock'
  | 'finance';

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
  sessions: SessionMetricsDto;
  stock: StockOpsMetricsDto;
  finance: FinanceOpsMetricsDto;
  /** Condições que merecem atenção operacional (derivadas das métricas). */
  alerts: MetricAlert[];
}
