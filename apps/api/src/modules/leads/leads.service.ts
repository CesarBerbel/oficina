import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import type {
  ConvertLeadToServiceOrderInput,
  CreateLeadInput,
  LeadContactAttemptDto,
  LeadCustomerSuggestionDto,
  LeadDetailDto,
  LeadDto,
  LeadEventDto,
  LeadMatchSummaryDto,
  LeadStatus,
  LeadVehicleMatchDto,
  LinkLeadCustomerInput,
  LinkLeadVehicleInput,
  ListLeadsQuery,
  Paginated,
  RegisterLeadContactInput,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const UNIQUE_CONSTRAINT_RETRY_ATTEMPTS = 3;

const leadDetailInclude = {
  contactAttempts: { orderBy: { createdAt: 'desc' } },
  events: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.LeadInclude;

type LeadRow = Prisma.LeadGetPayload<object>;
type LeadDetailRow = Prisma.LeadGetPayload<{ include: typeof leadDetailInclude }>;
type Tx = Prisma.TransactionClient;

type CustomerSuggestionSource = {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
};

type VehicleMatchSource = {
  id: string;
  plate: string;
  manufacturer: string;
  model: string;
  modelYear: number | null;
  customerId: string;
  customer: { name: string };
};

function digits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

function normalizePlate(value: string | null | undefined): string | null {
  const normalized = (value ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return normalized.length >= 7 ? normalized : null;
}

function firstLine(value: string): string {
  return value.split(/\r?\n/)[0]?.trim() ?? value;
}

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  private toDto(l: LeadRow): LeadDto {
    return {
      id: l.id,
      name: l.name,
      phone: l.phone,
      email: l.email,
      plate: l.plate,
      vehicle: l.vehicle,
      message: l.message,
      status: l.status,
      assignedToId: l.assignedToId,
      assignedToName: l.assignedToName,
      matchedCustomerId: l.matchedCustomerId,
      matchedVehicleId: l.matchedVehicleId,
      convertedCustomerId: l.convertedCustomerId,
      convertedVehicleId: l.convertedVehicleId,
      convertedServiceOrderId: l.convertedServiceOrderId,
      conflictLevel: l.conflictLevel,
      conflictReason: l.conflictReason,
      nextFollowUpAt: l.nextFollowUpAt?.toISOString() ?? null,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
    };
  }

  private toContactDto(row: LeadDetailRow['contactAttempts'][number]): LeadContactAttemptDto {
    return {
      id: row.id,
      channel: row.channel,
      outcome: row.outcome,
      notes: row.notes,
      nextFollowUpAt: row.nextFollowUpAt?.toISOString() ?? null,
      userName: row.userName,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toEventDto(row: LeadDetailRow['events'][number]): LeadEventDto {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      description: row.description,
      userName: row.userName,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async recordEvent(
    tx: Tx,
    input: {
      tenantId: string;
      leadId: string;
      actor?: AuthenticatedUser;
      type: string;
      title: string;
      description?: string | null;
      metadata?: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await tx.leadEvent.create({
      data: {
        tenantId: input.tenantId,
        leadId: input.leadId,
        userId: input.actor?.id ?? null,
        userName: input.actor?.email ?? null,
        type: input.type,
        title: input.title,
        description: input.description ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
  }

  private customerSuggestion(
    customer: CustomerSuggestionSource,
    lead: Pick<LeadRow, 'name' | 'phone' | 'email'>,
  ): LeadCustomerSuggestionDto {
    const leadPhone = digits(lead.phone);
    const customerPhone = digits(customer.phone);
    const customerWhatsapp = digits(customer.whatsapp);
    const leadEmail = lead.email?.toLowerCase() ?? null;
    const customerEmail = customer.email?.toLowerCase() ?? null;
    const leadName = lead.name.toLowerCase();
    const customerName = customer.name.toLowerCase();
    let score = 0;
    const reasons: string[] = [];

    if (leadPhone && (leadPhone === customerPhone || leadPhone === customerWhatsapp)) {
      score += 70;
      reasons.push('telefone confere');
    }
    if (leadEmail && customerEmail && leadEmail === customerEmail) {
      score += 60;
      reasons.push('e-mail confere');
    }
    if (customerName === leadName) {
      score += 40;
      reasons.push('nome igual');
    } else if (customerName.includes(leadName) || leadName.includes(customerName)) {
      score += 25;
      reasons.push('nome parecido');
    }

    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      whatsapp: customer.whatsapp,
      email: customer.email,
      score,
      reason: reasons.length > 0 ? reasons.join(', ') : 'possível correspondência',
    };
  }

  private vehicleMatchDto(vehicle: VehicleMatchSource): LeadVehicleMatchDto {
    return {
      id: vehicle.id,
      plate: vehicle.plate,
      manufacturer: vehicle.manufacturer,
      model: vehicle.model,
      modelYear: vehicle.modelYear,
      customerId: vehicle.customerId,
      customerName: vehicle.customer.name,
    };
  }

  private evaluateMatch(
    lead: LeadRow,
    suggestedCustomers: LeadCustomerSuggestionDto[],
    vehicle: LeadVehicleMatchDto | null,
  ): LeadMatchSummaryDto {
    const preferredCustomerId = lead.matchedCustomerId ?? suggestedCustomers[0]?.id ?? null;

    if (vehicle && preferredCustomerId && vehicle.customerId !== preferredCustomerId) {
      return {
        suggestedCustomers,
        vehicle,
        conflictLevel: 'ATENCAO',
        conflictReason: `A placa ${vehicle.plate} já está cadastrada para ${vehicle.customerName}. Confira antes de vincular ao cliente informado.`,
      };
    }

    if (vehicle && preferredCustomerId && vehicle.customerId === preferredCustomerId) {
      return {
        suggestedCustomers,
        vehicle,
        conflictLevel: 'OK',
        conflictReason: 'Cliente e veículo conferem.',
      };
    }

    if (vehicle && !preferredCustomerId) {
      return {
        suggestedCustomers,
        vehicle,
        conflictLevel: 'ATENCAO',
        conflictReason: `A placa ${vehicle.plate} já existe e pertence a ${vehicle.customerName}.`,
      };
    }

    if (!vehicle && suggestedCustomers.length > 0) {
      return {
        suggestedCustomers,
        vehicle,
        conflictLevel: 'ATENCAO',
        conflictReason: 'Cliente parecido encontrado. Confira telefone/e-mail antes de vincular.',
      };
    }

    return {
      suggestedCustomers,
      vehicle,
      conflictLevel: 'SEM_DADOS',
      conflictReason: 'Nenhum cliente ou veículo encontrado automaticamente.',
    };
  }

  private async buildMatch(tenantId: string, lead: LeadRow): Promise<LeadMatchSummaryDto> {
    const phone = digits(lead.phone);
    const email = lead.email?.toLowerCase() ?? undefined;
    const plate = normalizePlate(lead.plate);
    const name = lead.name.trim();

    const customers = await this.prisma.customer.findMany({
      where: {
        tenantId,
        OR: [
          ...(phone ? [{ phone: phone }, { whatsapp: phone }] : []),
          ...(email ? [{ email }] : []),
          { name: { contains: name, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, phone: true, whatsapp: true, email: true },
      take: 8,
    });

    const suggestedCustomers = customers
      .map((customer) => this.customerSuggestion(customer, lead))
      .filter((customer) => customer.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const vehicle = plate
      ? await this.prisma.vehicle.findFirst({
          where: { tenantId, plate },
          select: {
            id: true,
            plate: true,
            manufacturer: true,
            model: true,
            modelYear: true,
            customerId: true,
            customer: { select: { name: true } },
          },
        })
      : null;

    return this.evaluateMatch(
      lead,
      suggestedCustomers,
      vehicle ? this.vehicleMatchDto(vehicle) : null,
    );
  }

  private async syncMatchSnapshot(lead: LeadRow): Promise<LeadMatchSummaryDto> {
    const match = await this.buildMatch(lead.tenantId, lead);
    await this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        matchedCustomerId: lead.matchedCustomerId ?? match.suggestedCustomers[0]?.id ?? null,
        matchedVehicleId: lead.matchedVehicleId ?? match.vehicle?.id ?? null,
        conflictLevel: match.conflictLevel,
        conflictReason: match.conflictReason,
      },
    });
    return match;
  }

  /** Criado pelo formulário público do site. */
  async createFromPublic(tenantId: string, input: CreateLeadInput): Promise<void> {
    const lead = await this.prisma.lead.create({
      data: {
        tenantId,
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
        plate: normalizePlate(input.plate) ?? null,
        vehicle: input.vehicle ?? null,
        message: input.message,
        events: {
          create: {
            tenantId,
            type: 'LEAD_RECEIVED',
            title: 'Lead recebido pelo site',
            description: firstLine(input.message),
          },
        },
      },
    });
    await this.syncMatchSnapshot(lead);
    await this.notifications.notifyRoles(tenantId, ['ADMIN', 'ATENDENTE'], {
      type: 'LEAD_NEW',
      title: 'Novo lead do site',
      body: `${lead.name} · ${lead.phone}`,
      link: '/leads',
      entity: 'Lead',
      entityId: lead.id,
    });
  }

  async list(tenantId: string, query: ListLeadsQuery): Promise<Paginated<LeadDto>> {
    const { page, pageSize, status, search } = query;
    const normalizedSearchPlate = normalizePlate(search);
    const searchDigits = digits(search);
    const where: Prisma.LeadWhereInput = {
      tenantId,
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { message: { contains: search, mode: 'insensitive' } },
              { vehicle: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
              ...(searchDigits ? [{ phone: { contains: searchDigits } }] : []),
              ...(normalizedSearchPlate
                ? [{ plate: { contains: normalizedSearchPlate } }]
                : []),
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.lead.count({ where }),
      this.prisma.lead.findMany({
        where,
        orderBy: [{ nextFollowUpAt: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map((l) => this.toDto(l)),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  async findOne(tenantId: string, id: string): Promise<LeadDetailDto> {
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId },
      include: leadDetailInclude,
    });
    if (!lead) throw new NotFoundException('Lead não encontrado');
    const match = await this.buildMatch(tenantId, lead);
    return {
      ...this.toDto(lead),
      match,
      contactAttempts: lead.contactAttempts.map((row) => this.toContactDto(row)),
      events: lead.events.map((row) => this.toEventDto(row)),
    };
  }

  async updateStatus(
    actor: AuthenticatedUser,
    id: string,
    status: LeadStatus,
  ): Promise<LeadDetailDto> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.lead.findFirst({
        where: { id, tenantId: actor.tenantId },
        select: { id: true, status: true },
      });
      if (!current) throw new NotFoundException('Lead não encontrado');
      await tx.lead.update({
        where: { id },
        data: {
          status,
          closedAt: ['PERDIDO', 'DUPLICADO', 'INVALIDO', 'DESCARTADO'].includes(status)
            ? new Date()
            : undefined,
        },
      });
      await this.recordEvent(tx, {
        tenantId: actor.tenantId,
        leadId: id,
        actor,
        type: 'STATUS_CHANGE',
        title: 'Status do pré-atendimento alterado',
        description: `${current.status} → ${status}`,
      });
    });
    return this.findOne(actor.tenantId, id);
  }

  async registerContact(
    actor: AuthenticatedUser,
    id: string,
    input: RegisterLeadContactInput,
  ): Promise<LeadDetailDto> {
    await this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { id, tenantId: actor.tenantId },
        select: { id: true, name: true },
      });
      if (!lead) throw new NotFoundException('Lead não encontrado');

      await tx.leadContactAttempt.create({
        data: {
          tenantId: actor.tenantId,
          leadId: id,
          userId: actor.id,
          userName: actor.email,
          channel: input.channel,
          outcome: input.outcome,
          notes: input.notes ?? null,
          nextFollowUpAt: input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null,
        },
      });

      const status = this.statusForOutcome(input.outcome);
      await tx.lead.update({
        where: { id },
        data: {
          status,
          assignedToId: actor.id,
          assignedToName: actor.email,
          nextFollowUpAt: input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null,
          closedAt: ['PERDIDO', 'INVALIDO'].includes(status) ? new Date() : undefined,
        },
      });

      await this.recordEvent(tx, {
        tenantId: actor.tenantId,
        leadId: id,
        actor,
        type: 'CONTACT_ATTEMPT',
        title: 'Contato registrado',
        description: input.notes ?? null,
        metadata: {
          channel: input.channel,
          outcome: input.outcome,
          nextFollowUpAt: input.nextFollowUpAt ?? null,
        },
      });
    });
    return this.findOne(actor.tenantId, id);
  }

  private statusForOutcome(outcome: RegisterLeadContactInput['outcome']): LeadStatus {
    const statuses: Record<RegisterLeadContactInput['outcome'], LeadStatus> = {
      ATENDEU: 'CONTATO_REALIZADO',
      NAO_ATENDEU: 'EM_ATENDIMENTO',
      TELEFONE_INCORRETO: 'INVALIDO',
      CHAMAR_WHATSAPP: 'EM_ATENDIMENTO',
      PEDIU_RETORNO: 'RETORNAR_DEPOIS',
      AGENDOU_VISITA: 'AGENDADO',
      SEM_INTERESSE: 'PERDIDO',
      JA_RESOLVEU: 'PERDIDO',
      ORCAMENTO_ENVIADO: 'CONTATO_REALIZADO',
      CONVERTIDO_OS: 'CONVERTIDO',
    };
    return statuses[outcome];
  }

  async linkCustomer(
    actor: AuthenticatedUser,
    id: string,
    input: LinkLeadCustomerInput,
  ): Promise<LeadDetailDto> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: input.customerId, tenantId: actor.tenantId },
      select: { id: true, name: true },
    });
    if (!customer) throw new BadRequestException('Cliente inválido');

    await this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { id, tenantId: actor.tenantId },
        select: { id: true },
      });
      if (!lead) throw new NotFoundException('Lead não encontrado');

      await tx.lead.update({
        where: { id },
        data: {
          matchedCustomerId: customer.id,
          assignedToId: actor.id,
          assignedToName: actor.email,
          status: 'EM_ATENDIMENTO',
        },
      });
      await this.recordEvent(tx, {
        tenantId: actor.tenantId,
        leadId: id,
        actor,
        type: 'CUSTOMER_LINKED',
        title: 'Cliente vinculado ao pré-atendimento',
        description: customer.name,
      });
    });
    const detail = await this.findOne(actor.tenantId, id);
    await this.prisma.lead.update({
      where: { id },
      data: {
        conflictLevel: detail.match.conflictLevel,
        conflictReason: detail.match.conflictReason,
      },
    });
    return this.findOne(actor.tenantId, id);
  }

  async linkVehicle(
    actor: AuthenticatedUser,
    id: string,
    input: LinkLeadVehicleInput,
  ): Promise<LeadDetailDto> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: input.vehicleId, tenantId: actor.tenantId },
      select: { id: true, plate: true, customerId: true, customer: { select: { name: true } } },
    });
    if (!vehicle) throw new BadRequestException('Veículo inválido');

    await this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { id, tenantId: actor.tenantId },
        select: { id: true },
      });
      if (!lead) throw new NotFoundException('Lead não encontrado');

      await tx.lead.update({
        where: { id },
        data: {
          matchedVehicleId: vehicle.id,
          matchedCustomerId: vehicle.customerId,
          plate: vehicle.plate,
          assignedToId: actor.id,
          assignedToName: actor.email,
          status: 'EM_ATENDIMENTO',
        },
      });
      await this.recordEvent(tx, {
        tenantId: actor.tenantId,
        leadId: id,
        actor,
        type: 'VEHICLE_LINKED',
        title: 'Veículo vinculado ao pré-atendimento',
        description: `${vehicle.plate} · ${vehicle.customer.name}`,
      });
    });
    const detail = await this.findOne(actor.tenantId, id);
    await this.prisma.lead.update({
      where: { id },
      data: {
        conflictLevel: detail.match.conflictLevel,
        conflictReason: detail.match.conflictReason,
      },
    });
    return this.findOne(actor.tenantId, id);
  }

  private async nextOrderNumber(tx: Tx, tenantId: string): Promise<number> {
    const last = await tx.serviceOrder.aggregate({
      where: { tenantId },
      _max: { number: true },
    });
    return (last._max.number ?? 0) + 1;
  }

  private isUniqueConstraintError(err: unknown): boolean {
    return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
  }

  private async withUniqueConstraintRetry<T>(
    operation: () => Promise<T>,
    failureMessage: string,
  ): Promise<T> {
    for (let attempt = 1; attempt <= UNIQUE_CONSTRAINT_RETRY_ATTEMPTS; attempt += 1) {
      try {
        return await operation();
      } catch (err) {
        if (this.isUniqueConstraintError(err)) {
          if (attempt < UNIQUE_CONSTRAINT_RETRY_ATTEMPTS) continue;
          throw new ConflictException(failureMessage);
        }
        throw err;
      }
    }
    throw new ConflictException(failureMessage);
  }

  async convertToServiceOrder(
    actor: AuthenticatedUser,
    id: string,
    input: ConvertLeadToServiceOrderInput,
  ): Promise<LeadDetailDto> {
    await this.withUniqueConstraintRetry(
      () =>
        this.prisma.$transaction(async (tx) => {
          const lead = await tx.lead.findFirst({
            where: { id, tenantId: actor.tenantId },
          });
          if (!lead) throw new NotFoundException('Lead não encontrado');
          if (lead.convertedServiceOrderId) {
            throw new ConflictException('Lead já convertido em OS');
          }

          const customerId = await this.resolveCustomerForConversion(tx, actor, lead, input);
          const vehicleId = await this.resolveVehicleForConversion(tx, actor, lead, input, customerId);
          const number = await this.nextOrderNumber(tx, actor.tenantId);
          const reportedProblem = input.reportedProblem ?? lead.message;
          const order = await tx.serviceOrder.create({
            data: {
              tenantId: actor.tenantId,
              number,
              publicToken: randomBytes(24).toString('hex'),
              customerId,
              vehicleId,
              km: input.km ?? input.vehicle?.currentKm ?? null,
              dueDate: input.dueDate ? new Date(input.dueDate) : null,
              technicianId: input.technicianId ?? null,
              reportedProblem,
              status: 'ENTRADA',
              history: {
                create: {
                  status: 'ENTRADA',
                  userId: actor.id,
                  note: `OS aberta a partir do pré-atendimento ${lead.name}`,
                },
              },
              events: {
                create: {
                  tenantId: actor.tenantId,
                  type: 'STATUS_CHANGE',
                  title: 'OS criada a partir do pré-atendimento',
                  description: reportedProblem,
                  visibility: 'PUBLIC',
                  toStatus: 'ENTRADA',
                  createdById: actor.id,
                  metadata: { leadId: lead.id },
                },
              },
            },
            select: { id: true, number: true },
          });

          await tx.lead.update({
            where: { id },
            data: {
              status: 'CONVERTIDO',
              convertedCustomerId: customerId,
              convertedVehicleId: vehicleId,
              convertedServiceOrderId: order.id,
              matchedCustomerId: customerId,
              matchedVehicleId: vehicleId,
              conflictLevel: 'OK',
              conflictReason: `Convertido na OS #${order.number}.`,
              assignedToId: actor.id,
              assignedToName: actor.email,
              convertedAt: new Date(),
              closedAt: new Date(),
            },
          });

          await this.recordEvent(tx, {
            tenantId: actor.tenantId,
            leadId: id,
            actor,
            type: 'CONVERTED_TO_OS',
            title: `Convertido em OS #${order.number}`,
            description: 'Cliente, veículo e ordem de serviço registrados a partir do pré-atendimento.',
            metadata: { serviceOrderId: order.id, customerId, vehicleId },
          });
        }),
      'Não foi possível converter o pré-atendimento em OS',
    );

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'CONVERT',
      module: 'leads',
      entity: 'Lead',
      entityId: id,
    });

    return this.findOne(actor.tenantId, id);
  }

  private async resolveCustomerForConversion(
    tx: Tx,
    actor: AuthenticatedUser,
    lead: LeadRow,
    input: ConvertLeadToServiceOrderInput,
  ): Promise<string> {
    const customerId = input.customerId ?? lead.matchedCustomerId;
    if (customerId) {
      const customer = await tx.customer.findFirst({
        where: { id: customerId, tenantId: actor.tenantId },
        select: { id: true },
      });
      if (!customer) throw new BadRequestException('Cliente inválido para conversão');
      return customer.id;
    }

    if (!input.customer) {
      throw new BadRequestException('Selecione um cliente ou informe os dados do novo cliente');
    }

    const created = await tx.customer.create({
      data: {
        tenantId: actor.tenantId,
        type: 'PF',
        name: input.customer.name,
        phone: digits(input.customer.phone) || digits(lead.phone) || null,
        whatsapp: digits(input.customer.whatsapp) || digits(lead.phone) || null,
        email: input.customer.email ?? lead.email,
        notes: input.customer.notes ?? `Criado a partir do pré-atendimento: ${lead.message}`,
      },
      select: { id: true },
    });
    return created.id;
  }

  private async resolveVehicleForConversion(
    tx: Tx,
    actor: AuthenticatedUser,
    lead: LeadRow,
    input: ConvertLeadToServiceOrderInput,
    customerId: string,
  ): Promise<string> {
    const vehicleId = input.vehicleId ?? lead.matchedVehicleId;
    if (vehicleId) {
      const vehicle = await tx.vehicle.findFirst({
        where: { id: vehicleId, tenantId: actor.tenantId },
        select: { id: true, customerId: true },
      });
      if (!vehicle) throw new BadRequestException('Veículo inválido para conversão');
      if (vehicle.customerId !== customerId) {
        throw new BadRequestException(
          'A placa selecionada pertence a outro cliente. Vincule o cliente correto ou corrija o veículo antes de abrir OS.',
        );
      }
      return vehicle.id;
    }

    if (!input.vehicle) {
      throw new BadRequestException('Selecione um veículo ou informe os dados do novo veículo');
    }

    const plate = normalizePlate(input.vehicle.plate);
    if (!plate) throw new BadRequestException('Placa inválida');
    const clash = await tx.vehicle.findFirst({
      where: { tenantId: actor.tenantId, plate },
      select: { id: true, customerId: true },
    });
    if (clash) {
      if (clash.customerId !== customerId) {
        throw new BadRequestException('A placa já está cadastrada para outro cliente');
      }
      return clash.id;
    }

    const created = await tx.vehicle.create({
      data: {
        tenantId: actor.tenantId,
        customerId,
        plate,
        manufacturer: input.vehicle.manufacturer,
        model: input.vehicle.model,
        modelYear: input.vehicle.modelYear ?? null,
        color: input.vehicle.color ?? null,
        currentKm: input.vehicle.currentKm ?? input.km ?? null,
        notes: input.vehicle.notes ?? (lead.vehicle ? `Informado no site: ${lead.vehicle}` : null),
      },
      select: { id: true },
    });
    return created.id;
  }
}
