import { Injectable } from '@nestjs/common';
import {
  GlobalSearchEntityType,
  type GlobalSearchQuery,
  type GlobalSearchResponseDto,
  type GlobalSearchResultDto,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';

function digits(value: string): string {
  return value.replace(/\D/g, '');
}

function normalizePlate(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function includesNormalized(value: string | null | undefined, query: string): boolean {
  if (!value) return false;
  return value.toLowerCase().includes(query.toLowerCase());
}

function scoreText(values: Array<string | null | undefined>, query: string): number {
  const q = query.toLowerCase();
  let score = 0;
  for (const value of values) {
    if (!value) continue;
    const v = value.toLowerCase();
    if (v === q) score = Math.max(score, 100);
    else if (v.startsWith(q)) score = Math.max(score, 80);
    else if (v.includes(q)) score = Math.max(score, 55);
  }
  return score;
}

function compact(parts: Array<string | number | null | undefined>): string {
  return parts.filter((part) => part !== undefined && part !== null && String(part).trim() !== '').join(' • ');
}

@Injectable()
export class GlobalSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(tenantId: string, query: GlobalSearchQuery): Promise<GlobalSearchResponseDto> {
    const q = query.q.trim();
    const limit = query.limit;
    const numeric = digits(q);
    const plate = normalizePlate(q);
    const number = Number(numeric || q);
    const isNumber = Number.isFinite(number) && String(number) !== '';

    const [customers, vehicles, serviceOrders, leads, parts, services] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where: {
          tenantId,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { phone: { contains: numeric || q } },
            { whatsapp: { contains: numeric || q } },
            { document: { contains: numeric || q } },
            { city: { contains: q, mode: 'insensitive' } },
          ],
        },
        include: { _count: { select: { vehicles: true, serviceOrders: true } } },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      }),
      this.prisma.vehicle.findMany({
        where: {
          tenantId,
          OR: [
            { plate: { contains: plate || q, mode: 'insensitive' } },
            { manufacturer: { contains: q, mode: 'insensitive' } },
            { model: { contains: q, mode: 'insensitive' } },
            { color: { contains: q, mode: 'insensitive' } },
            { customer: { name: { contains: q, mode: 'insensitive' } } },
          ],
        },
        include: { customer: true },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      }),
      this.prisma.serviceOrder.findMany({
        where: {
          tenantId,
          OR: [
            ...(isNumber ? [{ number }] : []),
            { reportedProblem: { contains: q, mode: 'insensitive' } },
            { diagnosis: { contains: q, mode: 'insensitive' } },
            { notes: { contains: q, mode: 'insensitive' } },
            { customer: { name: { contains: q, mode: 'insensitive' } } },
            { vehicle: { plate: { contains: plate || q, mode: 'insensitive' } } },
          ],
        },
        include: { customer: true, vehicle: true, technician: true },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      }),
      this.prisma.lead.findMany({
        where: {
          tenantId,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { phone: { contains: numeric || q } },
            { email: { contains: q, mode: 'insensitive' } },
            { plate: { contains: plate || q, mode: 'insensitive' } },
            { vehicle: { contains: q, mode: 'insensitive' } },
            { message: { contains: q, mode: 'insensitive' } },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      }),
      this.prisma.part.findMany({
        where: {
          tenantId,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { sku: { contains: q, mode: 'insensitive' } },
            { ncm: { contains: numeric || q } },
            { brand: { contains: q, mode: 'insensitive' } },
            { category: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      }),
      this.prisma.service.findMany({
        where: {
          tenantId,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { category: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      }),
    ]);

    const results: GlobalSearchResultDto[] = [
      ...customers.map((customer) => ({
        id: customer.id,
        type: GlobalSearchEntityType.CUSTOMER,
        title: customer.name,
        subtitle: compact([customer.document, customer.phone ?? customer.whatsapp, customer.email]),
        description: compact([`${customer._count.vehicles} veículo(s)`, `${customer._count.serviceOrders} OS`]),
        badge: customer.type,
        href: `/clientes/${customer.id}`,
        score: 20 + scoreText([customer.name, customer.email, customer.document, customer.phone, customer.whatsapp], q),
        createdAt: customer.createdAt.toISOString(),
        updatedAt: customer.updatedAt.toISOString(),
      })),
      ...vehicles.map((vehicle) => ({
        id: vehicle.id,
        type: GlobalSearchEntityType.VEHICLE,
        title: compact([vehicle.plate, vehicle.manufacturer, vehicle.model]),
        subtitle: vehicle.customer.name,
        description: compact([vehicle.modelYear, vehicle.color, vehicle.currentKm ? `${vehicle.currentKm} km` : null]),
        badge: 'Veículo',
        href: `/veiculos?search=${encodeURIComponent(vehicle.plate)}`,
        score: 18 + Math.max(
          scoreText([vehicle.plate, vehicle.manufacturer, vehicle.model, vehicle.customer.name], q),
          includesNormalized(vehicle.plate, plate) ? 95 : 0,
        ),
        createdAt: vehicle.createdAt.toISOString(),
        updatedAt: vehicle.updatedAt.toISOString(),
      })),
      ...serviceOrders.map((order) => ({
        id: order.id,
        type: GlobalSearchEntityType.SERVICE_ORDER,
        title: `OS #${order.number}`,
        subtitle: compact([order.customer.name, order.vehicle.plate, order.vehicle.model]),
        description: order.reportedProblem,
        badge: order.status,
        href: `/os/${order.id}`,
        score: 16 + Math.max(
          isNumber && order.number === number ? 100 : 0,
          scoreText([order.customer.name, order.vehicle.plate, order.reportedProblem, order.diagnosis, order.notes], q),
        ),
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      })),
      ...leads.map((lead) => ({
        id: lead.id,
        type: GlobalSearchEntityType.LEAD,
        title: lead.name,
        subtitle: compact([lead.phone, lead.plate, lead.vehicle]),
        description: lead.message,
        badge: lead.status,
        href: `/leads?search=${encodeURIComponent(lead.name)}`,
        score: 14 + scoreText([lead.name, lead.phone, lead.email, lead.plate, lead.vehicle, lead.message], q),
        createdAt: lead.createdAt.toISOString(),
        updatedAt: lead.updatedAt.toISOString(),
      })),
      ...parts.map((part) => ({
        id: part.id,
        type: GlobalSearchEntityType.PART,
        title: part.name,
        subtitle: compact([part.sku ? `Código ${part.sku}` : null, part.ncm ? `NCM ${part.ncm}` : null, part.brand]),
        description: compact([part.category, `${part.currentStock.toString()} ${part.unit}`]),
        badge: part.active ? 'Ativa' : 'Inativa',
        href: `/estoque?search=${encodeURIComponent(part.name)}`,
        score: 12 + scoreText([part.name, part.sku, part.ncm, part.brand, part.category, part.description], q),
        createdAt: part.createdAt.toISOString(),
        updatedAt: part.updatedAt.toISOString(),
      })),
      ...services.map((service) => ({
        id: service.id,
        type: GlobalSearchEntityType.SERVICE,
        title: service.name,
        subtitle: service.category,
        description: service.description,
        badge: service.active ? 'Ativo' : 'Inativo',
        href: `/servicos?search=${encodeURIComponent(service.name)}`,
        score: 10 + scoreText([service.name, service.category, service.description], q),
        createdAt: service.createdAt.toISOString(),
        updatedAt: service.updatedAt.toISOString(),
      })),
    ];

    const sorted = results
      .sort((a, b) => b.score - a.score || (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
      .slice(0, Math.max(limit, 10));

    return {
      query: q,
      total: results.length,
      results: sorted,
    };
  }
}
