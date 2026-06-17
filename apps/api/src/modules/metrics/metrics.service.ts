import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { LedgerMetricsDto, OutboxMetricsDto, SystemMetricsDto } from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';

const dec = (v: Prisma.Decimal | number | null | undefined): number => (v == null ? 0 : Number(v));

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

  async system(tenantId: string): Promise<SystemMetricsDto> {
    const [outbox, ledger] = await Promise.all([this.outbox(tenantId), this.ledger(tenantId)]);
    return { outbox, ledger };
  }
}
