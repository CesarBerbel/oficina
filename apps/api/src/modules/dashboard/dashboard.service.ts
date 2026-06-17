import { Injectable } from '@nestjs/common';
import { type ServiceOrderStatus } from '@prisma/client';
import { SERVICE_ORDER_STATUS_LABELS } from '@oficina/shared';
import type { ActionItem, DashboardMetrics, DashboardProductivityDto, OperationalDashboardDto, OperationalDashboardSettingsDto, OperationalPriority, UpdateOperationalSettingsInput } from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';

const HOUR = 1000 * 60 * 60;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private toOperationalSettingsDto(settings: {
    appointmentLookaheadHours: number;
    waitingCustomerMinutes: number;
    stalledServiceOrderHours: number;
    pendingApprovalHours: number;
    crmHighPriorityLimit: number;
    enableAppointmentAlerts: boolean;
    enableWaitingCustomerAlerts: boolean;
    enableStalledOsAlerts: boolean;
    enablePendingApprovalAlerts: boolean;
    enableCrmAlerts: boolean;
  }): OperationalDashboardSettingsDto {
    return {
      appointmentLookaheadHours: settings.appointmentLookaheadHours,
      waitingCustomerMinutes: settings.waitingCustomerMinutes,
      stalledServiceOrderHours: settings.stalledServiceOrderHours,
      pendingApprovalHours: settings.pendingApprovalHours,
      crmHighPriorityLimit: settings.crmHighPriorityLimit,
      enableAppointmentAlerts: settings.enableAppointmentAlerts,
      enableWaitingCustomerAlerts: settings.enableWaitingCustomerAlerts,
      enableStalledOsAlerts: settings.enableStalledOsAlerts,
      enablePendingApprovalAlerts: settings.enablePendingApprovalAlerts,
      enableCrmAlerts: settings.enableCrmAlerts,
    };
  }

  async getOperationalSettings(tenantId: string): Promise<OperationalDashboardSettingsDto> {
    const existing = await this.prisma.operationalSettings.findUnique({ where: { tenantId } });
    const settings = existing ?? await this.prisma.operationalSettings.create({ data: { tenantId } });
    return this.toOperationalSettingsDto(settings);
  }

  async updateOperationalSettings(
    tenantId: string,
    input: UpdateOperationalSettingsInput,
  ): Promise<OperationalDashboardSettingsDto> {
    await this.getOperationalSettings(tenantId);
    const updated = await this.prisma.operationalSettings.update({
      where: { tenantId },
      data: input,
    });
    return this.toOperationalSettingsDto(updated);
  }

  private priorityByAge(minutes: number, mediumMinutes: number, highMinutes: number): OperationalPriority {
    if (minutes >= highMinutes) return 'alta';
    if (minutes >= mediumMinutes) return 'media';
    return 'baixa';
  }

  async operational(tenantId: string): Promise<OperationalDashboardDto> {
    const now = new Date();
    const settings = await this.getOperationalSettings(tenantId);
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    const lookahead = new Date(now.getTime() + settings.appointmentLookaheadHours * HOUR);
    const stalledSince = new Date(now.getTime() - settings.stalledServiceOrderHours * HOUR);
    const approvalSince = new Date(now.getTime() - settings.pendingApprovalHours * HOUR);
    const waitingSince = new Date(now.getTime() - settings.waitingCustomerMinutes * 60_000);

    const [appointmentsToday, upcomingLeads, waitingLeads, inExecution, pendingApprovals, stalledOrders, crmRows] =
      await Promise.all([
        this.prisma.lead.count({
          where: {
            tenantId,
            appointmentStartAt: { gte: startOfDay, lte: endOfDay },
            appointmentCanceledAt: null,
          },
        }),
        this.prisma.lead.findMany({
          where: {
            tenantId,
            appointmentStartAt: { gte: now, lte: lookahead },
            appointmentCanceledAt: null,
          },
          orderBy: { appointmentStartAt: 'asc' },
          take: 8,
          select: {
            id: true,
            name: true,
            plate: true,
            vehicle: true,
            appointmentStartAt: true,
            appointmentEndAt: true,
            appointmentServiceType: true,
            status: true,
          },
        }),
        this.prisma.lead.findMany({
          where: {
            tenantId,
            checkedInAt: { lte: waitingSince },
            convertedServiceOrderId: null,
            status: 'CLIENTE_CHEGOU',
          },
          orderBy: { checkedInAt: 'asc' },
          take: 10,
          select: { id: true, name: true, plate: true, checkedInAt: true },
        }),
        this.prisma.serviceOrder.count({ where: { tenantId, status: { in: ['EM_EXECUCAO', 'EM_TESTE'] } } }),
        this.prisma.serviceOrder.findMany({
          where: { tenantId, status: 'ORCAMENTO', openedAt: { lte: approvalSince } },
          orderBy: { openedAt: 'asc' },
          take: 10,
          select: { id: true, number: true, openedAt: true, customer: { select: { name: true } }, vehicle: { select: { plate: true } } },
        }),
        this.prisma.serviceOrder.findMany({
          where: { tenantId, status: { in: ['ENTRADA', 'ORCAMENTO_APROVADO', 'EM_EXECUCAO'] }, updatedAt: { lte: stalledSince } },
          orderBy: { updatedAt: 'asc' },
          take: 10,
          select: { id: true, number: true, status: true, updatedAt: true, customer: { select: { name: true } }, vehicle: { select: { plate: true } } },
        }),
        this.prisma.crmSettings.findUnique({ where: { tenantId }, select: { enabled: true } }),
      ]);

    const alerts: OperationalDashboardDto['alerts'] = [];
    if (settings.enableWaitingCustomerAlerts) {
      for (const lead of waitingLeads) {
        const ageMinutes = lead.checkedInAt ? Math.round((now.getTime() - lead.checkedInAt.getTime()) / 60_000) : null;
        alerts.push({
          id: `lead-waiting-${lead.id}`,
          title: 'Cliente aguardando OS',
          description: `${lead.name} chegou${lead.plate ? ` com o veículo ${lead.plate}` : ''} e ainda não virou OS.`,
          category: 'recepcao',
          priority: ageMinutes == null ? 'media' : this.priorityByAge(ageMinutes, settings.waitingCustomerMinutes, settings.waitingCustomerMinutes * 2),
          href: `/leads?id=${lead.id}`,
          ageMinutes,
        });
      }
    }
    if (settings.enablePendingApprovalAlerts) {
      for (const order of pendingApprovals) {
        const ageMinutes = Math.round((now.getTime() - order.openedAt.getTime()) / 60_000);
        alerts.push({
          id: `approval-${order.id}`,
          title: `OS #${order.number} aguardando aprovação`,
          description: `${order.customer.name} · ${order.vehicle.plate}`,
          category: 'oficina',
          priority: this.priorityByAge(ageMinutes, settings.pendingApprovalHours * 60, settings.pendingApprovalHours * 120),
          href: `/os/${order.id}`,
          ageMinutes,
        });
      }
    }
    if (settings.enableStalledOsAlerts) {
      for (const order of stalledOrders) {
        const ageMinutes = Math.round((now.getTime() - order.updatedAt.getTime()) / 60_000);
        alerts.push({
          id: `stalled-${order.id}`,
          title: `OS #${order.number} parada`,
          description: `${order.customer.name} · ${order.vehicle.plate} · ${SERVICE_ORDER_STATUS_LABELS[order.status]}`,
          category: 'oficina',
          priority: this.priorityByAge(ageMinutes, settings.stalledServiceOrderHours * 60, settings.stalledServiceOrderHours * 120),
          href: `/os/${order.id}`,
          ageMinutes,
        });
      }
    }

    const crmPriority = crmRows?.enabled ? await this.prisma.serviceOrder.count({
      where: { tenantId, status: 'ENTREGUE', closedAt: { lte: new Date(now.getTime() - 180 * 24 * HOUR) } },
    }) : 0;
    if (settings.enableCrmAlerts && crmPriority >= settings.crmHighPriorityLimit) {
      alerts.push({
        id: 'crm-priority',
        title: 'CRM com fila prioritária',
        description: `${crmPriority} possíveis retornos de pós-venda precisam de atenção.`,
        category: 'crm',
        priority: 'media',
        href: '/crm',
        ageMinutes: null,
      });
    }

    const kpis: OperationalDashboardDto['kpis'] = [
      { key: 'appointmentsToday', label: 'Agendamentos hoje', value: appointmentsToday, href: '/leads?view=agenda', priority: 'media', description: 'Agenda da Recepção para hoje.' },
      { key: 'waitingCustomers', label: 'Clientes aguardando', value: waitingLeads.length, href: '/leads', priority: waitingLeads.length > 0 ? 'alta' : 'baixa', description: 'Check-ins sem OS criada.' },
      { key: 'inExecution', label: 'OS em execução/teste', value: inExecution, href: '/kanban', priority: 'media', description: 'Serviços em andamento.' },
      { key: 'pendingApprovals', label: 'Aprovações vencidas', value: pendingApprovals.length, href: '/os?status=ORCAMENTO', priority: pendingApprovals.length > 0 ? 'alta' : 'baixa', description: 'Orçamentos aguardando resposta acima do limite configurado.' },
      { key: 'stalledOrders', label: 'OS paradas', value: stalledOrders.length, href: '/os', priority: stalledOrders.length > 0 ? 'alta' : 'baixa', description: 'OS sem atualização recente.' },
      { key: 'crmPriority', label: 'CRM prioritário', value: crmPriority, href: '/crm', priority: crmPriority > 0 ? 'media' : 'baixa', description: 'Retenções e revisões possíveis.' },
    ];

    return {
      generatedAt: now.toISOString(),
      settings,
      kpis,
      upcomingArrivals: upcomingLeads.map((lead) => ({
        id: lead.id,
        customerName: lead.name,
        vehicleLabel: [lead.plate, lead.vehicle].filter(Boolean).join(' · ') || null,
        startAt: lead.appointmentStartAt!.toISOString(),
        endAt: lead.appointmentEndAt?.toISOString() ?? null,
        serviceType: lead.appointmentServiceType,
        status: lead.status,
        href: `/leads?id=${lead.id}`,
      })),
      alerts: alerts.sort((a, b) => {
        const order: Record<OperationalPriority, number> = { alta: 0, media: 1, baixa: 2 };
        return order[a.priority] - order[b.priority] || (b.ageMinutes ?? 0) - (a.ageMinutes ?? 0);
      }).slice(0, 20),
    };
  }


  /** Peças abaixo do mínimo NA oficina: saldo por filial, mínimo do grupo. */
  private async lowStockCount(tenantId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM "parts" p
      LEFT JOIN "part_stock" ps ON ps."partId" = p."id" AND ps."tenantId" = ${tenantId}
      WHERE p."tenantId" = (SELECT COALESCE(t."parentId", t."id") FROM "tenants" t WHERE t."id" = ${tenantId})
        AND p."active" = true
        AND COALESCE(ps."currentStock", 0) <= p."minStock"
    `;
    return rows[0]?.count ?? 0;
  }

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
        this.lowStockCount(tenantId),
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
    const lowStock = await this.lowStockCount(tenantId);
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
        title: 'Novos pré-atendimentos do site',
        description: 'Contatos recebidos pelo formulário do site público.',
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
