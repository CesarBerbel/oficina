import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AiMetricsDto,
  BackupMetricsDto,
  HealthMetricsDto,
  LedgerMetricsDto,
  MetricAlert,
  OutboxMetricsDto,
  SmtpMetricsDto,
  SystemMetricsDto,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';

const dec = (v: Prisma.Decimal | number | null | undefined): number => (v == null ? 0 : Number(v));

/** Idade máxima aceitável do último backup antes de alertar (horas). */
const BACKUP_MAX_AGE_HOURS = Number(process.env.BACKUP_MAX_AGE_HOURS ?? 26);
/** Idade do pendente mais antigo do outbox antes de alertar (segundos). */
const OUTBOX_STUCK_AGE_SEC = Number(process.env.OUTBOX_STUCK_AGE_SEC ?? 600);

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async outbox(tenantId: string): Promise<OutboxMetricsDto> {
    const now = new Date();
    const [grouped, pendingDue, oldest, failures] = await Promise.all([
      this.prisma.outboxMessage.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { _all: true },
      }),
      this.prisma.outboxMessage.count({
        where: { tenantId, status: 'PENDING', availableAt: { lte: now } },
      }),
      this.prisma.outboxMessage.findFirst({
        where: { tenantId, status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      this.prisma.outboxMessage.findMany({
        where: { tenantId, status: 'FAILED' },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: { id: true, type: true, attempts: true, lastError: true, createdAt: true },
      }),
    ]);

    const count = (s: string): number => grouped.find((g) => g.status === s)?._count._all ?? 0;

    return {
      byStatus: {
        pending: count('PENDING'),
        processing: count('PROCESSING'),
        done: count('DONE'),
        failed: count('FAILED'),
      },
      pendingDue,
      oldestPendingAgeSec: oldest
        ? Math.max(0, Math.floor((now.getTime() - oldest.createdAt.getTime()) / 1000))
        : null,
      failures: failures.map((f) => ({
        id: f.id,
        type: f.type,
        attempts: f.attempts,
        lastError: f.lastError,
        createdAt: f.createdAt.toISOString(),
      })),
    };
  }

  async ledger(tenantId: string): Promise<LedgerMetricsDto> {
    const grouped = await this.prisma.financialLedgerEntry.groupBy({
      by: ['kind'],
      where: { tenantId },
      _sum: { amount: true },
      _count: { _all: true },
    });
    const sum = (k: string): number => dec(grouped.find((g) => g.kind === k)?._sum.amount);
    const movements = grouped.reduce((acc, g) => acc + g._count._all, 0);
    const issued = sum('ISSUE') + sum('ADJUSTMENT');
    const paid = sum('PAYMENT'); // negativo
    const canceled = sum('CANCELLATION'); // negativo
    return {
      movements,
      totalIssued: issued,
      totalPaid: Math.abs(paid),
      totalCanceled: Math.abs(canceled),
      outstanding: Math.round((issued + paid + canceled) * 100) / 100,
    };
  }

  async ai(tenantId: string): Promise<AiMetricsDto> {
    const now = new Date();
    const startOfDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [usageToday, usageMonth, failuresToday, lastFailure] = await Promise.all([
      this.prisma.aiUsageLog.count({ where: { tenantId, createdAt: { gte: startOfDay } } }),
      this.prisma.aiUsageLog.count({ where: { tenantId, createdAt: { gte: startOfMonth } } }),
      this.prisma.aiUsageLog.count({
        where: { tenantId, success: false, createdAt: { gte: startOfDay } },
      }),
      this.prisma.aiUsageLog.findFirst({
        where: { tenantId, success: false },
        orderBy: { createdAt: 'desc' },
        select: { error: true },
      }),
    ]);
    return { usageToday, usageMonth, failuresToday, lastError: lastFailure?.error ?? null };
  }

  smtp(): SmtpMetricsDto {
    const driver = process.env.MAIL_DRIVER ?? 'smtp';
    const configured =
      driver === 'smtp' ? Boolean(process.env.SMTP_HOST && process.env.SMTP_USER) : true;
    return { driver, configured };
  }

  async backup(): Promise<BackupMetricsDto> {
    const hb = await this.prisma.opsHeartbeat.findUnique({ where: { key: 'backup' } });
    const ageHours = hb ? (Date.now() - hb.at.getTime()) / 3_600_000 : null;
    return {
      lastAt: hb ? hb.at.toISOString() : null,
      ageHours: ageHours == null ? null : Math.round(ageHours * 10) / 10,
      maxAgeHours: BACKUP_MAX_AGE_HOURS,
      ok: ageHours != null && ageHours <= BACKUP_MAX_AGE_HOURS,
    };
  }

  async health(): Promise<HealthMetricsDto> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { dbOk: true };
    } catch {
      return { dbOk: false };
    }
  }

  private buildAlerts(m: Omit<SystemMetricsDto, 'alerts'>): MetricAlert[] {
    const alerts: MetricAlert[] = [];
    if (!m.health.dbOk) {
      alerts.push({ level: 'critical', source: 'health', message: 'Banco de dados inacessível.' });
    }
    if (m.outbox.byStatus.failed > 0) {
      alerts.push({
        level: 'critical',
        source: 'outbox',
        message: `${m.outbox.byStatus.failed} mensagem(ns) com falha definitiva no outbox.`,
      });
    }
    if (
      m.outbox.oldestPendingAgeSec != null &&
      m.outbox.oldestPendingAgeSec > OUTBOX_STUCK_AGE_SEC
    ) {
      alerts.push({
        level: 'warn',
        source: 'outbox',
        message: `Pendência mais antiga do outbox há ${Math.floor(m.outbox.oldestPendingAgeSec / 60)} min.`,
      });
    }
    if (!m.smtp.configured) {
      alerts.push({
        level: 'warn',
        source: 'smtp',
        message: 'SMTP marcado como driver mas sem host/usuário configurados.',
      });
    }
    if (!m.backup.ok) {
      alerts.push({
        level: m.backup.lastAt ? 'warn' : 'critical',
        source: 'backup',
        message: m.backup.lastAt
          ? `Último backup há ${m.backup.ageHours}h (limite ${m.backup.maxAgeHours}h).`
          : 'Nenhum backup registrado ainda.',
      });
    }
    if (m.ai.failuresToday > 0) {
      alerts.push({
        level: 'warn',
        source: 'ai',
        message: `${m.ai.failuresToday} falha(s) de IA hoje${m.ai.lastError ? `: ${m.ai.lastError}` : ''}.`,
      });
    }
    return alerts;
  }

  async system(tenantId: string): Promise<SystemMetricsDto> {
    const [outbox, ledger, ai, backup, health] = await Promise.all([
      this.outbox(tenantId),
      this.ledger(tenantId),
      this.ai(tenantId),
      this.backup(),
      this.health(),
    ]);
    const smtp = this.smtp();
    const base = { outbox, ledger, ai, smtp, backup, health };
    return { ...base, alerts: this.buildAlerts(base) };
  }
}
