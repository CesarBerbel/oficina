import { Injectable } from '@nestjs/common';
import { Prisma, type ServiceOrderStatus } from '@prisma/client';
import {
  SERVICE_ORDER_STATUS_LABELS,
  type ReportsSummary,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';

const dec = (v: Prisma.Decimal | number | null | undefined): number =>
  v == null ? 0 : Number(v);
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** OS que representam faturamento (aprovadas em diante, exceto canceladas). */
const REVENUE_STATUSES: ServiceOrderStatus[] = [
  'ORCAMENTO_APROVADO',
  'EM_EXECUCAO',
  'EM_TESTE',
  'PRONTA',
  'PRONTO_RETIRAR',
  'ENTREGUE',
];

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(tenantId: string): Promise<ReportsSummary> {
    const [byStatus, revenueOrders, delivered, topServicesRaw, topPartsRaw] =
      await Promise.all([
        this.prisma.serviceOrder.groupBy({
          by: ['status'],
          where: { tenantId },
          _count: { _all: true },
        }),
        this.prisma.serviceOrder.findMany({
          where: { tenantId, status: { in: REVENUE_STATUSES } },
          select: { total: true, openedAt: true },
        }),
        this.prisma.serviceOrder.count({ where: { tenantId, status: 'ENTREGUE' } }),
        this.prisma.serviceOrderItem.groupBy({
          by: ['description'],
          where: { kind: 'SERVICE', serviceOrder: { tenantId } },
          _sum: { total: true },
          orderBy: { _sum: { total: 'desc' } },
          take: 5,
        }),
        this.prisma.serviceOrderItem.groupBy({
          by: ['description'],
          where: { kind: 'PART', serviceOrder: { tenantId } },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: 'desc' } },
          take: 5,
        }),
      ]);

    const revenueTotal = round2(
      revenueOrders.reduce((acc, o) => acc + dec(o.total), 0),
    );

    // Faturamento por mês (últimos 6 meses)
    const buckets = new Map<string, number>();
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, 0);
    }
    for (const o of revenueOrders) {
      const key = `${o.openedAt.getFullYear()}-${String(o.openedAt.getMonth() + 1).padStart(2, '0')}`;
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + dec(o.total));
    }

    return {
      revenueTotal,
      deliveredCount: delivered,
      averageTicket:
        revenueOrders.length > 0 ? round2(revenueTotal / revenueOrders.length) : 0,
      revenueByMonth: [...buckets.entries()].map(([month, total]) => ({
        month,
        total: round2(total),
      })),
      osByStatus: byStatus.map((g) => ({
        status: g.status,
        label: SERVICE_ORDER_STATUS_LABELS[g.status],
        count: g._count._all,
      })),
      topServices: topServicesRaw.map((t) => ({
        name: t.description,
        value: round2(dec(t._sum.total)),
      })),
      topParts: topPartsRaw.map((t) => ({
        name: t.description,
        value: dec(t._sum.quantity),
      })),
    };
  }
}
