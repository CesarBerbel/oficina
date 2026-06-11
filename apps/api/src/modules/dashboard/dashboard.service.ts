import { Injectable } from '@nestjs/common';
import { type ServiceOrderStatus } from '@prisma/client';
import type { ActionItem, DashboardMetrics } from '@oficina/shared';
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
        title: 'Novos leads do site',
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
