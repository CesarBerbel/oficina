import { Injectable } from '@nestjs/common';
import { Prisma, type ServiceOrderStatus } from '@prisma/client';
import type {
  PostSaleDto,
  PostSaleOpportunityDto,
  PostSaleOpportunityPriority,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';

const dec = (v: Prisma.Decimal | number | null | undefined): number =>
  v == null ? 0 : Number(v);

const diffDays = (from: Date, to = new Date()): number =>
  Math.floor((to.getTime() - from.getTime()) / 86_400_000);

const deliveredStatuses: ServiceOrderStatus[] = ['ENTREGUE'];
const refusedStatuses: ServiceOrderStatus[] = ['ORCAMENTO_RECUSADO'];

function vehicleLabel(vehicle?: {
  plate: string;
  manufacturer: string;
  model: string;
} | null): string | null {
  if (!vehicle) return null;
  return `${vehicle.plate} · ${vehicle.manufacturer} ${vehicle.model}`;
}

function priorityByDays(days: number): PostSaleOpportunityPriority {
  if (days >= 365) return 'alta';
  if (days >= 210) return 'media';
  return 'baixa';
}

@Injectable()
export class CrmService {
  constructor(private readonly prisma: PrismaService) {}

  async postSale(tenantId: string, limit = 80): Promise<PostSaleDto> {
    const now = new Date();
    const reviewCutoff = new Date(now);
    reviewCutoff.setDate(reviewCutoff.getDate() - 180);
    const inactiveCutoff = new Date(now);
    inactiveCutoff.setDate(inactiveCutoff.getDate() - 365);
    const postDeliveryStart = new Date(now);
    postDeliveryStart.setDate(postDeliveryStart.getDate() - 21);
    const postDeliveryEnd = new Date(now);
    postDeliveryEnd.setDate(postDeliveryEnd.getDate() - 3);
    const refusedCutoff = new Date(now);
    refusedCutoff.setDate(refusedCutoff.getDate() - 45);

    const [lastOrders, recentDelivered, refusedOrders] = await Promise.all([
      this.prisma.serviceOrder.findMany({
        where: { tenantId, status: { in: deliveredStatuses } },
        orderBy: { closedAt: 'desc' },
        select: {
          id: true,
          number: true,
          total: true,
          closedAt: true,
          openedAt: true,
          customer: {
            select: { id: true, name: true, phone: true, whatsapp: true, email: true },
          },
          vehicle: {
            select: { id: true, plate: true, manufacturer: true, model: true },
          },
        },
        take: 500,
      }),
      this.prisma.serviceOrder.findMany({
        where: {
          tenantId,
          status: 'ENTREGUE',
          closedAt: { gte: postDeliveryStart, lte: postDeliveryEnd },
        },
        orderBy: { closedAt: 'desc' },
        select: {
          id: true,
          number: true,
          total: true,
          closedAt: true,
          customer: {
            select: { id: true, name: true, phone: true, whatsapp: true, email: true },
          },
          vehicle: {
            select: { id: true, plate: true, manufacturer: true, model: true },
          },
        },
        take: 100,
      }),
      this.prisma.serviceOrder.findMany({
        where: { tenantId, status: { in: refusedStatuses }, updatedAt: { gte: refusedCutoff } },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          number: true,
          total: true,
          updatedAt: true,
          customer: {
            select: { id: true, name: true, phone: true, whatsapp: true, email: true },
          },
          vehicle: {
            select: { id: true, plate: true, manufacturer: true, model: true },
          },
        },
        take: 100,
      }),
    ]);

    const lastByVehicle = new Map<string, (typeof lastOrders)[number]>();
    const lastByCustomer = new Map<string, (typeof lastOrders)[number]>();
    for (const order of lastOrders) {
      if (!lastByVehicle.has(order.vehicle.id)) lastByVehicle.set(order.vehicle.id, order);
      if (!lastByCustomer.has(order.customer.id)) lastByCustomer.set(order.customer.id, order);
    }

    const opportunities: PostSaleOpportunityDto[] = [];

    for (const order of lastByVehicle.values()) {
      const lastAt = order.closedAt ?? order.openedAt;
      if (lastAt > reviewCutoff) continue;
      const days = diffDays(lastAt, now);
      opportunities.push({
        key: `review-${order.vehicle.id}`,
        kind: 'REVISAO_PREVENTIVA',
        priority: priorityByDays(days),
        title: 'Revisão preventiva pendente',
        reason: `Veículo sem OS entregue há ${days} dias.`,
        suggestedMessage: `Olá, ${order.customer.name}. Tudo bem? Identificamos que o veículo ${order.vehicle.plate} está há ${days} dias sem revisão conosco. Podemos agendar uma revisão preventiva?`,
        customerId: order.customer.id,
        customerName: order.customer.name,
        phone: order.customer.phone,
        whatsapp: order.customer.whatsapp,
        email: order.customer.email,
        vehicleId: order.vehicle.id,
        vehicleLabel: vehicleLabel(order.vehicle),
        serviceOrderId: order.id,
        serviceOrderNumber: order.number,
        lastServiceAt: lastAt.toISOString(),
        daysSinceLastService: days,
        estimatedValue: dec(order.total),
      });
    }

    for (const order of lastByCustomer.values()) {
      const lastAt = order.closedAt ?? order.openedAt;
      if (lastAt > inactiveCutoff) continue;
      const days = diffDays(lastAt, now);
      opportunities.push({
        key: `inactive-${order.customer.id}`,
        kind: 'CLIENTE_INATIVO',
        priority: 'alta',
        title: 'Cliente inativo',
        reason: `Cliente sem retorno há ${days} dias.`,
        suggestedMessage: `Olá, ${order.customer.name}. Sentimos sua falta na Auto Mecânica Bandeirantes. Quer agendar uma avaliação preventiva do veículo?`,
        customerId: order.customer.id,
        customerName: order.customer.name,
        phone: order.customer.phone,
        whatsapp: order.customer.whatsapp,
        email: order.customer.email,
        vehicleId: order.vehicle.id,
        vehicleLabel: vehicleLabel(order.vehicle),
        serviceOrderId: order.id,
        serviceOrderNumber: order.number,
        lastServiceAt: lastAt.toISOString(),
        daysSinceLastService: days,
        estimatedValue: dec(order.total),
      });
    }

    for (const order of recentDelivered) {
      const closedAt = order.closedAt ?? now;
      const days = diffDays(closedAt, now);
      opportunities.push({
        key: `post-delivery-${order.id}`,
        kind: 'RETORNO_POS_ENTREGA',
        priority: 'media',
        title: 'Retorno pós-entrega',
        reason: `OS entregue há ${days} dias. Bom momento para confirmar satisfação.`,
        suggestedMessage: `Olá, ${order.customer.name}. Passando para saber se ficou tudo certo com o serviço no veículo ${order.vehicle.plate}. Conte com a Auto Mecânica Bandeirantes.`,
        customerId: order.customer.id,
        customerName: order.customer.name,
        phone: order.customer.phone,
        whatsapp: order.customer.whatsapp,
        email: order.customer.email,
        vehicleId: order.vehicle.id,
        vehicleLabel: vehicleLabel(order.vehicle),
        serviceOrderId: order.id,
        serviceOrderNumber: order.number,
        lastServiceAt: closedAt.toISOString(),
        daysSinceLastService: days,
        estimatedValue: dec(order.total),
      });
    }

    for (const order of refusedOrders) {
      const days = diffDays(order.updatedAt, now);
      opportunities.push({
        key: `refused-${order.id}`,
        kind: 'ORCAMENTO_RECUSADO',
        priority: days >= 15 ? 'media' : 'baixa',
        title: 'Orçamento recusado para recuperar',
        reason: `Orçamento recusado há ${days} dias.`,
        suggestedMessage: `Olá, ${order.customer.name}. Podemos rever o orçamento da OS ${order.number} e buscar a melhor alternativa para o veículo ${order.vehicle.plate}?`,
        customerId: order.customer.id,
        customerName: order.customer.name,
        phone: order.customer.phone,
        whatsapp: order.customer.whatsapp,
        email: order.customer.email,
        vehicleId: order.vehicle.id,
        vehicleLabel: vehicleLabel(order.vehicle),
        serviceOrderId: order.id,
        serviceOrderNumber: order.number,
        lastServiceAt: order.updatedAt.toISOString(),
        daysSinceLastService: days,
        estimatedValue: dec(order.total),
      });
    }

    const rank: Record<PostSaleOpportunityPriority, number> = { alta: 0, media: 1, baixa: 2 };
    const unique = new Map<string, PostSaleOpportunityDto>();
    for (const item of opportunities) {
      if (!unique.has(item.key)) unique.set(item.key, item);
    }

    const sorted = [...unique.values()]
      .sort((a, b) => rank[a.priority] - rank[b.priority] || (b.daysSinceLastService ?? 0) - (a.daysSinceLastService ?? 0))
      .slice(0, Math.max(1, Math.min(limit, 200)));

    return {
      generatedAt: now.toISOString(),
      summary: {
        total: sorted.length,
        highPriority: sorted.filter((o) => o.priority === 'alta').length,
        preventiveReview: sorted.filter((o) => o.kind === 'REVISAO_PREVENTIVA').length,
        inactiveCustomers: sorted.filter((o) => o.kind === 'CLIENTE_INATIVO').length,
        postDeliveryReturn: sorted.filter((o) => o.kind === 'RETORNO_POS_ENTREGA').length,
        refusedQuotes: sorted.filter((o) => o.kind === 'ORCAMENTO_RECUSADO').length,
      },
      opportunities: sorted,
    };
  }
}
