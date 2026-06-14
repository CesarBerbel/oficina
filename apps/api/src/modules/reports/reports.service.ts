import { Injectable } from '@nestjs/common';
import { Prisma, type LeadStatus, type ServiceOrderStatus } from '@prisma/client';
import {
  LEAD_STATUS_LABELS,
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

  async summary(tenantId: string, periodDays = 180): Promise<ReportsSummary> {
    const safePeriodDays = Math.max(30, Math.min(periodDays || 180, 730));
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - safePeriodDays);

    const [
      byStatus,
      revenueOrders,
      openedOrders,
      delivered,
      topServicesRaw,
      topPartsRaw,
      serviceCosts,
      partCosts,
      leadFunnelRaw,
    ] = await Promise.all([
      this.prisma.serviceOrder.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { _all: true },
      }),
      this.prisma.serviceOrder.findMany({
        where: {
          tenantId,
          status: { in: REVENUE_STATUSES },
          openedAt: { gte: periodStart },
        },
        select: {
          id: true,
          total: true,
          openedAt: true,
          technician: { select: { name: true } },
          customer: { select: { name: true } },
        },
      }),
      this.prisma.serviceOrder.count({
        where: { tenantId, openedAt: { gte: periodStart } },
      }),
      this.prisma.serviceOrder.count({
        where: { tenantId, status: 'ENTREGUE', openedAt: { gte: periodStart } },
      }),
      this.prisma.serviceOrderItem.groupBy({
        by: ['description'],
        where: {
          kind: 'SERVICE',
          serviceOrder: { tenantId, openedAt: { gte: periodStart } },
        },
        _sum: { total: true },
        orderBy: { _sum: { total: 'desc' } },
        take: 8,
      }),
      this.prisma.serviceOrderItem.groupBy({
        by: ['description'],
        where: {
          kind: 'PART',
          serviceOrder: { tenantId, openedAt: { gte: periodStart } },
        },
        _sum: { quantity: true, total: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 8,
      }),
      this.prisma.serviceOrderItem.findMany({
        where: {
          kind: 'SERVICE',
          sourceServiceId: { not: null },
          serviceOrder: {
            tenantId,
            status: { in: REVENUE_STATUSES },
            openedAt: { gte: periodStart },
          },
        },
        select: {
          quantity: true,
          sourceServiceId: true,
          serviceOrder: { select: { id: true } },
        },
      }),
      this.prisma.serviceOrderItem.findMany({
        where: {
          kind: 'PART',
          sourcePartId: { not: null },
          serviceOrder: {
            tenantId,
            status: { in: REVENUE_STATUSES },
            openedAt: { gte: periodStart },
          },
        },
        select: { quantity: true, sourcePartId: true },
      }),
      this.prisma.lead.groupBy({
        by: ['status'],
        where: { tenantId, createdAt: { gte: periodStart } },
        _count: { _all: true },
      }),
    ]);

    const serviceIds = [
      ...new Set(serviceCosts.map((item) => item.sourceServiceId).filter(Boolean)),
    ] as string[];
    const partIds = [
      ...new Set(partCosts.map((item) => item.sourcePartId).filter(Boolean)),
    ] as string[];
    const [services, parts] = await Promise.all([
      serviceIds.length
        ? this.prisma.service.findMany({
            where: { tenantId, id: { in: serviceIds } },
            select: { id: true, cost: true },
          })
        : Promise.resolve([]),
      partIds.length
        ? this.prisma.part.findMany({
            where: { tenantId, id: { in: partIds } },
            select: { id: true, costPrice: true },
          })
        : Promise.resolve([]),
    ]);

    const serviceCostMap = new Map(services.map((s) => [s.id, dec(s.cost)]));
    const partCostMap = new Map(parts.map((p) => [p.id, dec(p.costPrice)]));

    const servicesCost = round2(
      serviceCosts.reduce(
        (acc, item) =>
          acc + dec(item.quantity) * (serviceCostMap.get(item.sourceServiceId ?? '') ?? 0),
        0,
      ),
    );
    const partsCost = round2(
      partCosts.reduce(
        (acc, item) => acc + dec(item.quantity) * (partCostMap.get(item.sourcePartId ?? '') ?? 0),
        0,
      ),
    );

    const revenueTotal = round2(
      revenueOrders.reduce((acc, o) => acc + dec(o.total), 0),
    );
    const grossProfit = round2(revenueTotal - servicesCost - partsCost);

    const monthBuckets = new Map<string, number>();
    const dailyBuckets = new Map<string, number>();
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthBuckets.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, 0);
    }
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      dailyBuckets.set(d.toISOString().slice(0, 10), 0);
    }

    const byTechnician = new Map<string, number>();
    const byCustomer = new Map<string, number>();
    for (const order of revenueOrders) {
      const monthKey = `${order.openedAt.getFullYear()}-${String(order.openedAt.getMonth() + 1).padStart(2, '0')}`;
      if (monthBuckets.has(monthKey)) {
        monthBuckets.set(monthKey, (monthBuckets.get(monthKey) ?? 0) + dec(order.total));
      }
      const dayKey = order.openedAt.toISOString().slice(0, 10);
      if (dailyBuckets.has(dayKey)) {
        dailyBuckets.set(dayKey, (dailyBuckets.get(dayKey) ?? 0) + dec(order.total));
      }
      const technician = order.technician?.name ?? 'Sem técnico';
      byTechnician.set(technician, (byTechnician.get(technician) ?? 0) + dec(order.total));
      byCustomer.set(order.customer.name, (byCustomer.get(order.customer.name) ?? 0) + dec(order.total));
    }

    const convertedLeads = leadFunnelRaw
      .filter((l) => l.status === 'CONVERTIDO')
      .reduce((acc, item) => acc + item._count._all, 0);
    const totalLeads = leadFunnelRaw.reduce((acc, item) => acc + item._count._all, 0);

    return {
      revenueTotal,
      deliveredCount: delivered,
      averageTicket:
        revenueOrders.length > 0 ? round2(revenueTotal / revenueOrders.length) : 0,
      periodDays: safePeriodDays,
      openedOrders,
      approvalRate: openedOrders > 0 ? round2((revenueOrders.length / openedOrders) * 100) : 0,
      conversionRate: totalLeads > 0 ? round2((convertedLeads / totalLeads) * 100) : 0,
      grossProfit,
      grossMargin: revenueTotal > 0 ? round2((grossProfit / revenueTotal) * 100) : 0,
      partsCost,
      servicesCost,
      revenueByMonth: [...monthBuckets.entries()].map(([month, total]) => ({
        month,
        total: round2(total),
      })),
      dailyRevenue: [...dailyBuckets.entries()].map(([month, total]) => ({
        month,
        total: round2(total),
      })),
      osByStatus: byStatus.map((g) => ({
        status: g.status,
        label: SERVICE_ORDER_STATUS_LABELS[g.status],
        count: g._count._all,
      })),
      leadFunnel: leadFunnelRaw.map((g) => ({
        status: g.status,
        label: LEAD_STATUS_LABELS[g.status as LeadStatus],
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
      revenueByTechnician: [...byTechnician.entries()]
        .map(([name, value]) => ({ name, value: round2(value) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
      revenueByCustomer: [...byCustomer.entries()]
        .map(([name, value]) => ({ name, value: round2(value) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
    };
  }
}
