import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateCustomerInput,
  Customer360Dto,
  Customer360TimelineItemDto,
  CustomerDto,
  ListCustomersQuery,
  Paginated,
  UpdateCustomerInput,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

type CustomerRow = Prisma.CustomerGetPayload<{
  include: { _count: { select: { vehicles: true } } };
}>;

function toDto(c: CustomerRow): CustomerDto {
  return {
    id: c.id,
    type: c.type,
    name: c.name,
    document: c.document,
    phone: c.phone,
    whatsapp: c.whatsapp,
    email: c.email,
    zip: c.zip,
    street: c.street,
    number: c.number,
    complement: c.complement,
    district: c.district,
    city: c.city,
    state: c.state,
    categories: c.categories,
    notes: c.notes,
    birthDate: c.birthDate ? c.birthDate.toISOString().slice(0, 10) : null,
    vehiclesCount: c._count.vehicles,
    createdAt: c.createdAt.toISOString(),
  };
}

const withCount = {
  include: { _count: { select: { vehicles: true } } },
} satisfies Prisma.CustomerDefaultArgs;


const dec = (value: Prisma.Decimal | number | null | undefined): number =>
  value == null ? 0 : Number(value);

const diffDays = (from: Date, to = new Date()): number =>
  Math.floor((to.getTime() - from.getTime()) / 86_400_000);

const compact = (values: Array<string | number | null | undefined>): string =>
  values
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
    .map(String)
    .join(' · ');

const DEFAULT_CRM_SETTINGS = {
  enabled: true,
  reviewIntervalDays: 180,
  reviewIntervalKm: 10000,
  reviewKmWarning: 1000,
  inactiveCustomerDays: 365,
  postDeliveryStartDays: 3,
  postDeliveryEndDays: 21,
  refusedQuoteRecoveryDays: 45,
  refusedQuoteMinimumAgeDays: 15,
  highPriorityDays: 365,
  mediumPriorityDays: 210,
  enablePreventiveReview: true,
  enableKmReview: true,
  enableInactiveCustomers: true,
  enablePostDeliveryReturn: true,
  enableRefusedQuoteRecovery: true,
};

function priorityByDays(days: number, settings: typeof DEFAULT_CRM_SETTINGS): 'baixa' | 'media' | 'alta' {
  if (days >= settings.highPriorityDays) return 'alta';
  if (days >= settings.mediumPriorityDays) return 'media';
  return 'baixa';
}

function renderCustomerMessage(
  template: string,
  data: { cliente: string; placa?: string | null; veiculo?: string | null },
): string {
  return template
    .replaceAll('{cliente}', data.cliente)
    .replaceAll('{placa}', data.placa ?? 'seu veículo')
    .replaceAll('{veiculo}', data.veiculo ?? data.placa ?? 'seu veículo');
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    tenantId: string,
    query: ListCustomersQuery,
  ): Promise<Paginated<CustomerDto>> {
    const { page, pageSize, search, type, sortBy, sortOrder } = query;

    const where: Prisma.CustomerWhereInput = {
      tenantId,
      ...(type ? { type } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { document: { contains: search.replace(/\D/g, '') } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
              { whatsapp: { contains: search } },
              { city: { contains: search, mode: 'insensitive' } },
              { state: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.CustomerOrderByWithRelationInput = {
      [sortBy && ['name', 'createdAt'].includes(sortBy) ? sortBy : 'name']:
        sortBy ? sortOrder : 'asc',
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        ...withCount,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      data: rows.map(toDto),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }



  async find360(tenantId: string, id: string): Promise<Customer360Dto> {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId },
      ...withCount,
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado');

    const [vehicles, serviceOrders, leads, checkins, messages, crmSettingsRow] =
      await Promise.all([
        this.prisma.vehicle.findMany({
          where: { tenantId, customerId: id },
          include: { _count: { select: { serviceOrders: true } } },
          orderBy: [{ updatedAt: 'desc' }, { plate: 'asc' }],
        }),
        this.prisma.serviceOrder.findMany({
          where: { tenantId, customerId: id },
          include: {
            vehicle: true,
            technician: { select: { name: true } },
            quote: true,
          },
          orderBy: { updatedAt: 'desc' },
          take: 40,
        }),
        this.prisma.lead.findMany({
          where: {
            tenantId,
            OR: [
              { matchedCustomerId: id },
              { convertedCustomerId: id },
              ...(customer.phone ? [{ phone: { contains: customer.phone } }] : []),
              ...(customer.whatsapp ? [{ phone: { contains: customer.whatsapp } }] : []),
              ...(customer.email ? [{ email: customer.email }] : []),
            ],
          },
          orderBy: { updatedAt: 'desc' },
          take: 30,
        }),
        this.prisma.vehicleCheckin.findMany({
          where: { tenantId, customerId: id },
          include: {
            vehicle: { select: { plate: true } },
            serviceOrder: { select: { id: true, number: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        this.prisma.messageLog.findMany({
          where: { tenantId, customerId: id },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        this.prisma.crmSettings.findUnique({ where: { tenantId } }),
      ]);

    const serviceOrdersByVehicle = new Map<string, Date>();
    for (const order of serviceOrders) {
      const date = order.closedAt ?? order.openedAt;
      const current = serviceOrdersByVehicle.get(order.vehicleId);
      if (!current || date > current) serviceOrdersByVehicle.set(order.vehicleId, date);
    }

    const quotes = serviceOrders
      .filter((order) => order.quote)
      .map((order) => ({
        id: order.quote!.id,
        serviceOrderId: order.id,
        serviceOrderNumber: order.number,
        status: order.quote!.status,
        total: dec(order.quote!.total),
        decisionType: order.quote!.decisionType,
        decidedAt: order.quote!.decidedAt?.toISOString() ?? null,
        createdAt: order.quote!.createdAt.toISOString(),
      }));

    const deliveredOrders = serviceOrders.filter((order) => order.status === 'ENTREGUE');
    const openStatuses = new Set([
      'ENTRADA',
      'DIAGNOSTICO_PRONTO',
      'ORCAMENTO',
      'ORCAMENTO_APROVADO',
      'AGUARDANDO_PECA',
      'EM_EXECUCAO',
      'EM_TESTE',
      'PRONTA',
      'PRONTO_RETIRAR',
    ]);
    const totalSpent = deliveredOrders.reduce((sum, order) => sum + dec(order.total), 0);
    const lastVisit = deliveredOrders
      .map((order) => order.closedAt ?? order.openedAt)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    const settings = crmSettingsRow
      ? {
          enabled: crmSettingsRow.enabled,
          reviewIntervalDays: crmSettingsRow.reviewIntervalDays,
          reviewIntervalKm: crmSettingsRow.reviewIntervalKm,
          reviewKmWarning: crmSettingsRow.reviewKmWarning,
          inactiveCustomerDays: crmSettingsRow.inactiveCustomerDays,
          postDeliveryStartDays: crmSettingsRow.postDeliveryStartDays,
          postDeliveryEndDays: crmSettingsRow.postDeliveryEndDays,
          refusedQuoteRecoveryDays: crmSettingsRow.refusedQuoteRecoveryDays,
          refusedQuoteMinimumAgeDays: crmSettingsRow.refusedQuoteMinimumAgeDays,
          highPriorityDays: crmSettingsRow.highPriorityDays,
          mediumPriorityDays: crmSettingsRow.mediumPriorityDays,
          enablePreventiveReview: crmSettingsRow.enablePreventiveReview,
          enableKmReview: crmSettingsRow.enableKmReview,
          enableInactiveCustomers: crmSettingsRow.enableInactiveCustomers,
          enablePostDeliveryReturn: crmSettingsRow.enablePostDeliveryReturn,
          enableRefusedQuoteRecovery: crmSettingsRow.enableRefusedQuoteRecovery,
        }
      : DEFAULT_CRM_SETTINGS;

    const crmOpportunities: Customer360Dto['crmOpportunities'] = [];
    if (settings.enabled) {
      for (const vehicle of vehicles) {
        const lastOrder = deliveredOrders
          .filter((order) => order.vehicleId === vehicle.id)
          .sort((a, b) => (b.closedAt ?? b.openedAt).getTime() - (a.closedAt ?? a.openedAt).getTime())[0];
        const vehicleLabel = `${vehicle.plate} · ${vehicle.manufacturer} ${vehicle.model}`;
        if (lastOrder) {
          const days = diffDays(lastOrder.closedAt ?? lastOrder.openedAt);
          if (settings.enablePreventiveReview && days >= settings.reviewIntervalDays) {
            crmOpportunities.push({
              key: `review-time-${vehicle.id}`,
              kind: 'REVISAO_PREVENTIVA',
              title: 'Revisão preventiva por tempo',
              reason: `Última OS entregue há ${days} dias`,
              priority: priorityByDays(days, settings),
              vehicleId: vehicle.id,
              vehicleLabel,
              suggestedMessage: renderCustomerMessage(
                'Olá, {cliente}. Identificamos que o veículo {placa} está há algum tempo sem revisão conosco. Podemos agendar uma revisão preventiva?',
                { cliente: customer.name, placa: vehicle.plate, veiculo: vehicleLabel },
              ),
            });
          }
          if (
            settings.enableKmReview &&
            lastOrder.km != null &&
            vehicle.currentKm != null &&
            vehicle.currentKm - lastOrder.km >= settings.reviewIntervalKm - settings.reviewKmWarning
          ) {
            crmOpportunities.push({
              key: `review-km-${vehicle.id}`,
              kind: 'REVISAO_KM',
              title: 'Revisão preventiva por KM',
              reason: `Rodou ${(vehicle.currentKm - lastOrder.km).toLocaleString('pt-BR')} km desde a última OS`,
              priority: vehicle.currentKm - lastOrder.km >= settings.reviewIntervalKm ? 'alta' : 'media',
              vehicleId: vehicle.id,
              vehicleLabel,
              suggestedMessage: renderCustomerMessage(
                'Olá, {cliente}. Pela quilometragem do veículo {placa}, ele está próximo da próxima revisão. Quer agendar?',
                { cliente: customer.name, placa: vehicle.plate, veiculo: vehicleLabel },
              ),
            });
          }
          const postDeliveryDays = days;
          if (
            settings.enablePostDeliveryReturn &&
            postDeliveryDays >= settings.postDeliveryStartDays &&
            postDeliveryDays <= settings.postDeliveryEndDays
          ) {
            crmOpportunities.push({
              key: `post-delivery-${lastOrder.id}`,
              kind: 'RETORNO_POS_ENTREGA',
              title: 'Retorno pós-entrega',
              reason: `OS #${lastOrder.number} entregue há ${postDeliveryDays} dias`,
              priority: 'media',
              vehicleId: vehicle.id,
              vehicleLabel,
              suggestedMessage: renderCustomerMessage(
                'Olá, {cliente}. Passando para saber se ficou tudo certo com o serviço realizado no veículo {placa}.',
                { cliente: customer.name, placa: vehicle.plate, veiculo: vehicleLabel },
              ),
            });
          }
        }
      }

      if (settings.enableInactiveCustomers && lastVisit) {
        const daysInactive = diffDays(lastVisit);
        if (daysInactive >= settings.inactiveCustomerDays) {
          crmOpportunities.push({
            key: `inactive-${customer.id}`,
            kind: 'CLIENTE_INATIVO',
            title: 'Cliente inativo',
            reason: `Cliente sem OS entregue há ${daysInactive} dias`,
            priority: 'alta',
            vehicleId: null,
            vehicleLabel: null,
            suggestedMessage: renderCustomerMessage(
              'Olá, {cliente}. Sentimos sua falta na Auto Mecânica Bandeirantes. Quer agendar uma avaliação preventiva?',
              { cliente: customer.name },
            ),
          });
        }
      }

      if (settings.enableRefusedQuoteRecovery) {
        for (const order of serviceOrders.filter((item) => item.status === 'ORCAMENTO_RECUSADO')) {
          const age = diffDays(order.updatedAt);
          if (age >= settings.refusedQuoteMinimumAgeDays && age <= settings.refusedQuoteRecoveryDays) {
            const vehicleLabel = `${order.vehicle.plate} · ${order.vehicle.manufacturer} ${order.vehicle.model}`;
            crmOpportunities.push({
              key: `refused-${order.id}`,
              kind: 'ORCAMENTO_RECUSADO',
              title: 'Recuperar orçamento recusado',
              reason: `OS #${order.number} recusada há ${age} dias`,
              priority: age >= settings.mediumPriorityDays ? 'media' : 'baixa',
              vehicleId: order.vehicleId,
              vehicleLabel,
              suggestedMessage: renderCustomerMessage(
                'Olá, {cliente}. Gostaria de verificar se ainda possui interesse no orçamento anteriormente apresentado para o veículo {placa}.',
                { cliente: customer.name, placa: order.vehicle.plate, veiculo: vehicleLabel },
              ),
            });
          }
        }
      }
    }

    const timelineItems: Customer360TimelineItemDto[] = [
      {
        id: `customer-${customer.id}`,
        type: 'CUSTOMER',
        title: 'Cliente cadastrado',
        description: customer.document ?? null,
        href: `/clientes/${customer.id}`,
        occurredAt: customer.createdAt.toISOString(),
      },
      ...vehicles.map((vehicle) => ({
        id: `vehicle-${vehicle.id}`,
        type: 'VEHICLE' as const,
        title: `Veículo ${vehicle.plate}`,
        description: compact([vehicle.manufacturer, vehicle.model, vehicle.modelYear]),
        href: `/veiculos?search=${encodeURIComponent(vehicle.plate)}`,
        occurredAt: vehicle.createdAt.toISOString(),
      })),
      ...leads.map((lead) => ({
        id: `lead-${lead.id}`,
        type: 'LEAD' as const,
        title: `Atendimento ${lead.status}`,
        description: compact([lead.plate, lead.message]),
        href: `/leads?search=${encodeURIComponent(lead.name)}`,
        occurredAt: lead.updatedAt.toISOString(),
      })),
      ...serviceOrders.map((order) => ({
        id: `os-${order.id}`,
        type: 'SERVICE_ORDER' as const,
        title: `OS #${order.number} · ${order.status}`,
        description: compact([order.vehicle.plate, order.reportedProblem]),
        href: `/os/${order.id}`,
        occurredAt: order.updatedAt.toISOString(),
      })),
      ...quotes.map((quote) => ({
        id: `quote-${quote.id}`,
        type: 'QUOTE' as const,
        title: `Orçamento OS #${quote.serviceOrderNumber} · ${quote.status}`,
        description: `Total R$ ${quote.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        href: `/os/${quote.serviceOrderId}`,
        occurredAt: quote.decidedAt ?? quote.createdAt,
      })),
      ...checkins.map((checkin) => ({
        id: `checkin-${checkin.id}`,
        type: 'CHECKIN' as const,
        title: `Check-in OS #${checkin.serviceOrder.number}`,
        description: compact([checkin.vehicle.plate, checkin.km != null ? `${checkin.km} km` : null]),
        href: `/check-in/${checkin.id}`,
        occurredAt: checkin.createdAt.toISOString(),
      })),
      ...messages.map((message) => ({
        id: `message-${message.id}`,
        type: 'MESSAGE' as const,
        title: `Mensagem ${message.channel} · ${message.status}`,
        description: message.body,
        href: null,
        occurredAt: message.createdAt.toISOString(),
      })),
      ...crmOpportunities.map((opportunity) => ({
        id: `crm-${opportunity.key}`,
        type: 'CRM' as const,
        title: opportunity.title,
        description: opportunity.reason,
        href: '/crm',
        occurredAt: new Date().toISOString(),
      })),
    ];

    const timeline: Customer360Dto['timeline'] = timelineItems
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, 80);

    return {
      customer: toDto(customer),
      kpis: {
        vehicles: vehicles.length,
        serviceOrders: serviceOrders.length,
        openServiceOrders: serviceOrders.filter((order) => openStatuses.has(order.status)).length,
        deliveredServiceOrders: deliveredOrders.length,
        quotes: quotes.length,
        openLeads: leads.filter((lead) => !['CONVERTIDO', 'PERDIDO', 'CANCELADO', 'DESCARTADO'].includes(lead.status)).length,
        crmOpportunities: crmOpportunities.length,
        totalSpent,
        averageTicket: deliveredOrders.length > 0 ? totalSpent / deliveredOrders.length : 0,
        lastVisitAt: lastVisit?.toISOString() ?? null,
      },
      vehicles: vehicles.map((vehicle) => ({
        id: vehicle.id,
        plate: vehicle.plate,
        manufacturer: vehicle.manufacturer,
        model: vehicle.model,
        modelYear: vehicle.modelYear,
        color: vehicle.color,
        currentKm: vehicle.currentKm,
        notes: vehicle.notes,
        serviceOrdersCount: vehicle._count.serviceOrders,
        lastServiceOrderAt: serviceOrdersByVehicle.get(vehicle.id)?.toISOString() ?? null,
      })),
      serviceOrders: serviceOrders.map((order) => ({
        id: order.id,
        number: order.number,
        status: order.status,
        vehicleId: order.vehicleId,
        vehiclePlate: order.vehicle.plate,
        vehicleLabel: `${order.vehicle.manufacturer} ${order.vehicle.model}`,
        technicianName: order.technician?.name ?? null,
        reportedProblem: order.reportedProblem,
        total: dec(order.total),
        openedAt: order.openedAt.toISOString(),
        closedAt: order.closedAt?.toISOString() ?? null,
        updatedAt: order.updatedAt.toISOString(),
        quoteStatus: order.quote?.status ?? null,
      })),
      leads: leads.map((lead) => ({
        id: lead.id,
        status: lead.status,
        name: lead.name,
        phone: lead.phone,
        plate: lead.plate,
        vehicle: lead.vehicle,
        message: lead.message,
        appointmentStartAt: lead.appointmentStartAt?.toISOString() ?? null,
        convertedServiceOrderId: lead.convertedServiceOrderId,
        createdAt: lead.createdAt.toISOString(),
        updatedAt: lead.updatedAt.toISOString(),
      })),
      quotes,
      checkins: checkins.map((checkin) => ({
        id: checkin.id,
        serviceOrderId: checkin.serviceOrderId,
        serviceOrderNumber: checkin.serviceOrder.number,
        vehiclePlate: checkin.vehicle.plate,
        km: checkin.km,
        photosCount: checkin.photos.length,
        signedBy: checkin.signedBy,
        createdAt: checkin.createdAt.toISOString(),
      })),
      messages: messages.map((message) => ({
        id: message.id,
        channel: message.channel,
        event: message.event,
        status: message.status,
        to: message.to,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
      })),
      crmOpportunities,
      timeline,
    };
  }


  async findOne(tenantId: string, id: string): Promise<CustomerDto> {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId },
      ...withCount,
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado');
    return toDto(customer);
  }

  async create(
    actor: AuthenticatedUser,
    input: CreateCustomerInput,
  ): Promise<CustomerDto> {
    if (input.document) {
      const clash = await this.prisma.customer.findFirst({
        where: { tenantId: actor.tenantId, document: input.document },
      });
      if (clash)
        throw new ConflictException('Já existe um cliente com este CPF/CNPJ');
    }

    const { birthDate, ...rest } = input;
    const created = await this.prisma.customer.create({
      data: {
        tenantId: actor.tenantId,
        ...rest,
        ...(birthDate ? { birthDate: new Date(birthDate) } : {}),
      },
      ...withCount,
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'CREATE',
      module: 'customers',
      entity: 'Customer',
      entityId: created.id,
      after: { name: created.name, document: created.document },
    });

    return toDto(created);
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    input: UpdateCustomerInput,
  ): Promise<CustomerDto> {
    const current = await this.prisma.customer.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!current) throw new NotFoundException('Cliente não encontrado');

    if (input.document && input.document !== current.document) {
      const clash = await this.prisma.customer.findFirst({
        where: {
          tenantId: actor.tenantId,
          document: input.document,
          NOT: { id },
        },
      });
      if (clash)
        throw new ConflictException('CPF/CNPJ já cadastrado em outro cliente');
    }

    const { birthDate, ...rest } = input;
    const updated = await this.prisma.customer.update({
      where: { id },
      data: {
        ...rest,
        ...(birthDate !== undefined ? { birthDate: new Date(birthDate) } : {}),
      },
      ...withCount,
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'UPDATE',
      module: 'customers',
      entity: 'Customer',
      entityId: id,
    });

    return toDto(updated);
  }

  async remove(actor: AuthenticatedUser, id: string): Promise<void> {
    const current = await this.prisma.customer.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: { _count: { select: { vehicles: true } } },
    });
    if (!current) throw new NotFoundException('Cliente não encontrado');
    if (current._count.vehicles > 0) {
      throw new ConflictException(
        'Não é possível excluir: o cliente possui veículos vinculados',
      );
    }

    await this.prisma.customer.delete({ where: { id } });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'DELETE',
      module: 'customers',
      entity: 'Customer',
      entityId: id,
      before: { name: current.name },
    });
  }
}
