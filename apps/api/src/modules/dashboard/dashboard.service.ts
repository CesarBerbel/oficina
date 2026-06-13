import { Injectable } from '@nestjs/common';
import { type ServiceOrderStatus } from '@prisma/client';
import { SERVICE_ORDER_STATUS_LABELS } from '@oficina/shared';
import type { ActionItem, DashboardMetrics, DashboardProductivityDto } from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';

const HOUR = 1000 * 60 * 60;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async metrics(tenantId: string): Promise<DashboardMetrics> {
    const now = new Date();
    const [byStatus, overdue, lowStock, pendingPurchases, openQuotes, leads, failedMessages] =
      await Promise.all([
        this.prisma.serviceOrder.groupBy({
          by: ['status'],
          where: { tenantId },
          _count: { _all: true },
        }),
        this.prisma.serviceOrder.count({
          where: {
            tenantId,
            dueDate: { lt: now },
            status: { notIn: ['ENTREGUE', 'CANCELADA', 'PRONTO_RETIRAR'] },
          },
        }),
        this.prisma.part.count({
          where: {
            tenantId,
            active: true,
            currentStock: { lte: this.prisma.part.fields.minStock },
          },
        }),
        this.prisma.purchaseOrder.count({
          where: {
            tenantId,
            status: { in: ['ABERTO', 'ENVIADO', 'PARCIALMENTE_RECEBIDO'] },
          },
        }),
        this.prisma.quote.count({ where: { tenantId, status: 'ENVIADO' } }),
        this.prisma.lead.count({ where: { tenantId, status: 'NOVO' } }),
        this.prisma.messageLog.count({ where: { tenantId, status: 'FALHA' } }),
      ]);

    const count = (s: ServiceOrderStatus): number =>
      byStatus.find((g) => g.status === s)?._count._all ?? 0;

    const ready = count('PRONTA') + count('PRONTO_RETIRAR');
    const active =
      count('ENTRADA') +
      count('DIAGNOSTICO_PRONTO') +
      count('ORCAMENTO') +
      count('ORCAMENTO_APROVADO') +
      count('EM_EXECUCAO') +
      count('EM_TESTE') +
      ready;

    return {
      osOpen: active,
      osEntrada: count('ENTRADA'),
      osDiagnosis: count('DIAGNOSTICO_PRONTO'),
      osAwaitingApproval: count('ORCAMENTO'),
      osApproved: count('ORCAMENTO_APROVADO'),
      osInExecution: count('EM_EXECUCAO'),
      osInTest: count('EM_TESTE'),
      osReady: ready,
      osOverdue: overdue,
      lowStock,
      pendingPurchases,
      openQuotes,
      leads,
      pendingMessages: failedMessages,
    };
  }

  private ageHours(date: Date | null | undefined): number | null {
    if (!date) return null;
    return Math.max(0, Math.round((Date.now() - date.getTime()) / HOUR));
  }

  async productivity(tenantId: string): Promise<DashboardProductivityDto> {
    const periodDays = 30;
    const since = new Date(Date.now() - periodDays * 24 * HOUR);

    const delivered = await this.prisma.serviceOrder.findMany({
      where: { tenantId, closedAt: { gte: since }, status: 'ENTREGUE' },
      select: { openedAt: true, closedAt: true, technicianId: true, technician: { select: { name: true } } },
    });

    const average = (values: number[]): number | null => {
      if (values.length === 0) return null;
      return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
    };

    const cycleHours = delivered
      .map((order) => order.closedAt ? (order.closedAt.getTime() - order.openedAt.getTime()) / HOUR : null)
      .filter((value): value is number => value != null && value >= 0);

    const activeByTechnician = await this.prisma.serviceOrder.groupBy({
      by: ['technicianId'],
      where: {
        tenantId,
        status: { notIn: ['ENTREGUE', 'CANCELADA', 'ORCAMENTO_RECUSADO'] },
      },
      _count: { _all: true },
    });

    const technicianIds = Array.from(new Set([
      ...delivered.map((order) => order.technicianId).filter(Boolean),
      ...activeByTechnician.map((row) => row.technicianId).filter(Boolean),
    ])) as string[];
    const users = await this.prisma.user.findMany({
      where: { tenantId, id: { in: technicianIds } },
      select: { id: true, name: true },
    });
    const names = new Map(users.map((user) => [user.id, user.name]));

    const technicianMap = new Map<string, {
      technicianId: string | null;
      technicianName: string;
      deliveredOrders: number;
      activeOrders: number;
      cycleHours: number[];
    }>();
    const ensureTech = (id: string | null, name?: string | null) => {
      const key = id ?? 'unassigned';
      const existing = technicianMap.get(key);
      if (existing) return existing;
      const technicianName = name ?? (id ? names.get(id) ?? 'Técnico' : 'Sem técnico');
      const created = {
        technicianId: id,
        technicianName,
        deliveredOrders: 0,
        activeOrders: 0,
        cycleHours: [] as number[],
      };
      technicianMap.set(key, created);
      return created;
    };

    for (const order of delivered) {
      const tech = ensureTech(order.technicianId, order.technician?.name);
      tech.deliveredOrders += 1;
      if (order.closedAt) {
        tech.cycleHours.push((order.closedAt.getTime() - order.openedAt.getTime()) / HOUR);
      }
    }
    for (const row of activeByTechnician) {
      ensureTech(row.technicianId).activeOrders = row._count._all;
    }

    const history = await this.prisma.serviceOrderStatusHistory.findMany({
      where: { serviceOrder: { tenantId }, createdAt: { gte: since } },
      orderBy: [{ serviceOrderId: 'asc' }, { createdAt: 'asc' }],
      select: { serviceOrderId: true, status: true, createdAt: true },
    });
    const durations = new Map<ServiceOrderStatus, number[]>();
    for (let index = 0; index < history.length; index++) {
      const current = history[index];
      const next = history[index + 1];
      if (!next || next.serviceOrderId !== current.serviceOrderId) continue;
      const hours = (next.createdAt.getTime() - current.createdAt.getTime()) / HOUR;
      if (hours < 0) continue;
      const bucket = durations.get(current.status) ?? [];
      bucket.push(hours);
      durations.set(current.status, bucket);
    }

    return {
      periodDays,
      deliveredOrders: delivered.length,
      averageCycleHours: average(cycleHours),
      averageStatusHours: Array.from(durations.entries()).map(([status, values]) => ({
        status,
        label: SERVICE_ORDER_STATUS_LABELS[status],
        averageHours: average(values),
        sampleSize: values.length,
      })),
      technicians: Array.from(technicianMap.values())
        .map((tech) => ({
          technicianId: tech.technicianId,
          technicianName: tech.technicianName,
          deliveredOrders: tech.deliveredOrders,
          activeOrders: tech.activeOrders,
          averageCycleHours: average(tech.cycleHours),
        }))
        .sort((a, b) => b.deliveredOrders - a.deliveredOrders || b.activeOrders - a.activeOrders),
    };
  }

  async actions(tenantId: string): Promise<ActionItem[]> {
    const now = new Date();
    const actions: ActionItem[] = [];

    const pushOsAction = async (
      key: string,
      status: ServiceOrderStatus,
      title: string,
      description: string,
      priority: ActionItem['priority'],
      link: string,
    ) => {
      const [count, oldest] = await Promise.all([
        this.prisma.serviceOrder.count({ where: { tenantId, status } }),
        this.prisma.serviceOrder.findFirst({
          where: { tenantId, status },
          orderBy: { openedAt: 'asc' },
          select: { openedAt: true },
        }),
      ]);
      if (count > 0) {
        actions.push({
          key,
          type: 'os',
          title,
          description,
          priority,
          count,
          link,
          ageHours: this.ageHours(oldest?.openedAt),
        });
      }
    };

    await pushOsAction(
      'os-diagnostico',
      'ENTRADA',
      'OS aguardando diagnóstico',
      'Veículos na entrada esperando diagnóstico técnico.',
      'media',
      '/os?status=ENTRADA',
    );
    await pushOsAction(
      'os-aprovacao',
      'ORCAMENTO',
      'Orçamentos aguardando resposta do cliente',
      'OS com orçamento enviado sem aprovação.',
      'alta',
      '/os?status=ORCAMENTO',
    );
    await pushOsAction(
      'os-execucao',
      'ORCAMENTO_APROVADO',
      'OS aprovadas aguardando execução',
      'Orçamentos aprovados prontos para iniciar.',
      'alta',
      '/os?status=ORCAMENTO_APROVADO',
    );
    await pushOsAction(
      'os-retirar',
      'PRONTO_RETIRAR',
      'OS prontas para retirar',
      'Avisar o cliente para retirada do veículo.',
      'media',
      '/os?status=PRONTO_RETIRAR',
    );

    // OS atrasadas
    const overdue = await this.prisma.serviceOrder.count({
      where: {
        tenantId,
        dueDate: { lt: now },
        status: { notIn: ['ENTREGUE', 'CANCELADA', 'PRONTO_RETIRAR'] },
      },
    });
    if (overdue > 0) {
      actions.push({
        key: 'os-atrasada',
        type: 'os',
        title: 'OS atrasadas',
        description: 'Passaram da data prevista e não foram concluídas.',
        priority: 'alta',
        count: overdue,
        link: '/os',
        ageHours: null,
      });
    }

    // Estoque baixo
    const lowStock = await this.prisma.part.count({
      where: {
        tenantId,
        active: true,
        currentStock: { lte: this.prisma.part.fields.minStock },
      },
    });
    if (lowStock > 0) {
      actions.push({
        key: 'estoque-baixo',
        type: 'inventory',
        title: 'Peças com estoque baixo',
        description: 'Itens no ou abaixo do estoque mínimo.',
        priority: 'media',
        count: lowStock,
        link: '/estoque',
        ageHours: null,
      });
    }

    // Compras pendentes
    const pendingPurchases = await this.prisma.purchaseOrder.count({
      where: { tenantId, status: { in: ['ABERTO', 'ENVIADO', 'PARCIALMENTE_RECEBIDO'] } },
    });
    if (pendingPurchases > 0) {
      actions.push({
        key: 'compras-pendentes',
        type: 'purchase',
        title: 'Pedidos de compra pendentes',
        description: 'Pedidos abertos, enviados ou parcialmente recebidos.',
        priority: 'baixa',
        count: pendingPurchases,
        link: '/compras',
        ageHours: null,
      });
    }

    // Leads novos do site
    const newLeads = await this.prisma.lead.count({
      where: { tenantId, status: 'NOVO' },
    });
    if (newLeads > 0) {
      actions.push({
        key: 'leads-novos',
        type: 'lead',
        title: 'Novos atendimentos do site',
        description: 'Contatos aguardando primeira ação na Recepção.',
        priority: 'alta',
        count: newLeads,
        link: '/leads',
        ageHours: null,
      });
    }

    // Ordena por prioridade
    const order: Record<ActionItem['priority'], number> = { alta: 0, media: 1, baixa: 2 };
    return actions.sort((a, b) => order[a.priority] - order[b.priority]);
  }
}
