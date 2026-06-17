import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PublicTrackingDto } from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { quoteInclude, toQuoteDto } from '../quotes/quote.mapper';

const dec = (v: Prisma.Decimal | number | null | undefined): number => (v == null ? 0 : Number(v));

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  async getTracking(token: string): Promise<PublicTrackingDto> {
    const order = await this.prisma.serviceOrder.findUnique({
      where: { publicToken: token },
      include: {
        tenant: { select: { name: true } },
        customer: { select: { name: true } },
        vehicle: {
          select: { plate: true, manufacturer: true, model: true, modelYear: true },
        },
        items: { orderBy: { createdAt: 'asc' } },
        history: { orderBy: { createdAt: 'asc' } },
        events: {
          where: { visibility: 'PUBLIC' },
          orderBy: { createdAt: 'asc' },
        },
        quote: { include: quoteInclude },
      },
    });
    if (!order) throw new NotFoundException('Acompanhamento não encontrado');

    const year = order.vehicle.modelYear ? ` ${order.vehicle.modelYear}` : '';

    // Orçamento aprovado não fica mais acessível publicamente (não pode ser
    // reaberto/aprovado de novo pelo link). O acompanhamento da OS continua.
    const quoteDecided =
      order.quote?.status === 'APROVADO' || order.quote?.status === 'APROVADO_PARCIAL';

    return {
      shopName: order.tenant.name,
      number: order.number,
      status: order.status,
      openedAt: order.openedAt.toISOString(),
      dueDate: order.dueDate ? order.dueDate.toISOString() : null,
      customerName: order.customer.name,
      vehicleLabel: `${order.vehicle.manufacturer} ${order.vehicle.model}${year}`,
      vehiclePlate: order.vehicle.plate,
      reportedProblem: order.reportedProblem,
      diagnosis: order.diagnosis,
      publicNotes: quoteDecided ? null : (order.quote?.publicNotes ?? null),
      items: order.items.map((it) => ({
        kind: it.kind,
        description: it.description,
        quantity: dec(it.quantity),
        unitPrice: dec(it.unitPrice),
        total: dec(it.total),
      })),
      totalServices: dec(order.totalServices),
      totalParts: dec(order.totalParts),
      discount: dec(order.discount),
      total: dec(order.total),
      timeline:
        order.events.length > 0
          ? order.events.map((event) => ({
              status: event.toStatus,
              title: event.title,
              description: event.description,
              photos: event.photos,
              createdAt: event.createdAt.toISOString(),
            }))
          : order.history.map((h) => ({
              status: h.status,
              title: h.status,
              description: null,
              photos: [],
              createdAt: h.createdAt.toISOString(),
            })),
      quote: order.quote && !quoteDecided ? toQuoteDto(order.quote, order.publicToken) : null,
    };
  }
}
