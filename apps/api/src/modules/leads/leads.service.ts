import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import type {
  AppointmentActionInput,
  ConvertLeadToServiceOrderInput,
  CreateDirectReceptionLeadInput,
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
  ReceptionAlertsDto,
  RegisterLeadContactInput,
  ScheduleLeadInput,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const UNIQUE_CONSTRAINT_RETRY_ATTEMPTS = 3;
const RECEPTION_ALERT_ARRIVAL_WINDOW_MINUTES = 60;
const RECEPTION_ALERT_NO_SHOW_TOLERANCE_MINUTES = 15;
const OPEN_APPOINTMENT_STATUSES: LeadStatus[] = ['AGENDADO', 'CONFIRMADO'];
const ACTIVE_RECEPTION_STATUSES: LeadStatus[] = [
  'NOVO',
  'EM_ATENDIMENTO',
  'CONTATO_REALIZADO',
  'RETORNAR_DEPOIS',
  'AGENDADO',
  'CONFIRMADO',
  'CLIENTE_CHEGOU',
];

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
      appointmentStartAt: l.appointmentStartAt?.toISOString() ?? null,
      appointmentEndAt: l.appointmentEndAt?.toISOString() ?? null,
      appointmentServiceType: l.appointmentServiceType,
      appointmentNotes: l.appointmentNotes,
      appointmentConfirmedAt: l.appointmentConfirmedAt?.toISOString() ?? null,
      checkedInAt: l.checkedInAt?.toISOString() ?? null,
      noShowAt: l.noShowAt?.toISOString() ?? null,
      appointmentCanceledAt: l.appointmentCanceledAt?.toISOString() ?? null,
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
            title: 'Atendimento recebido pelo site',
            description: firstLine(input.message),
          },
        },
      },
    });
    await this.syncMatchSnapshot(lead);
    await this.notifications.notifyRoles(tenantId, ['ADMIN', 'ATENDENTE'], {
      type: 'LEAD_NEW',
      title: 'Novo atendimento do site',
      body: `${lead.name} · ${lead.phone}`,
      link: '/leads',
      entity: 'Lead',
      entityId: lead.id,
    });
  }

  /** Criado manualmente pela recepção quando o cliente chega direto na oficina. */
  async createDirectReception(
    actor: AuthenticatedUser,
    input: CreateDirectReceptionLeadInput,
  ): Promise<LeadDetailDto> {
    const now = new Date();
    const lead = await this.prisma.lead.create({
      data: {
        tenantId: actor.tenantId,
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
        plate: normalizePlate(input.plate) ?? null,
        vehicle: input.vehicle ?? null,
        message: input.message,
        status: 'CLIENTE_CHEGOU',
        assignedToId: actor.id,
        assignedToName: actor.email,
        appointmentStartAt: now,
        appointmentEndAt: now,
        appointmentServiceType: input.appointmentServiceType ?? 'Atendimento presencial',
        appointmentNotes: input.appointmentNotes ?? null,
        checkedInAt: now,
        events: {
          create: [
            {
              tenantId: actor.tenantId,
              userId: actor.id,
              userName: actor.email,
              type: 'DIRECT_RECEPTION_CREATED',
              title: 'Cliente recebido direto na oficina',
              description: firstLine(input.message),
              metadata: {
                appointmentServiceType: input.appointmentServiceType ?? null,
              },
            },
            {
              tenantId: actor.tenantId,
              userId: actor.id,
              userName: actor.email,
              type: 'CHECKED_IN',
              title: 'Chegada registrada pela recepção',
              description: input.appointmentNotes ?? null,
            },
          ],
        },
        contactAttempts: {
          create: {
            tenantId: actor.tenantId,
            userId: actor.id,
            userName: actor.email,
            channel: 'PRESENCIAL',
            outcome: 'CLIENTE_CHEGOU',
            notes: input.appointmentNotes ?? 'Cliente chegou direto na oficina.',
          },
        },
      },
    });

    await this.syncMatchSnapshot(lead);
    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'CREATE_DIRECT_RECEPTION',
      module: 'leads',
      entity: 'Lead',
      entityId: lead.id,
    });

    return this.findOne(actor.tenantId, lead.id);
  }

  async list(tenantId: string, query: ListLeadsQuery): Promise<Paginated<LeadDto>> {
    const { page, pageSize, status, search, appointmentFrom, appointmentTo } = query;
    const normalizedSearchPlate = normalizePlate(search);
    const searchDigits = digits(search);
    const appointmentWindow = appointmentFrom || appointmentTo
      ? {
          appointmentStartAt: {
            ...(appointmentFrom ? { gte: new Date(appointmentFrom) } : {}),
            ...(appointmentTo ? { lt: new Date(appointmentTo) } : {}),
          },
        }
      : {};
    const where: Prisma.LeadWhereInput = {
      tenantId,
      ...appointmentWindow,
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
        orderBy: [
          { appointmentStartAt: 'asc' },
          { nextFollowUpAt: 'asc' },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map((l) => this.toDto(l)),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  async receptionAlerts(tenantId: string): Promise<ReceptionAlertsDto> {
    const now = new Date();
    const arrivalWindowEnd = new Date(
      now.getTime() + RECEPTION_ALERT_ARRIVAL_WINDOW_MINUTES * 60_000,
    );
    const noShowCutoff = new Date(
      now.getTime() - RECEPTION_ALERT_NO_SHOW_TOLERANCE_MINUTES * 60_000,
    );

    const commonWhere: Prisma.LeadWhereInput = {
      tenantId,
      status: { in: OPEN_APPOINTMENT_STATUSES },
      appointmentStartAt: { not: null },
      convertedServiceOrderId: null,
      checkedInAt: null,
      noShowAt: null,
      appointmentCanceledAt: null,
    };

    const [upcomingRows, noShowRows, overdueFollowUpRows, checkedInRows] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where: {
          ...commonWhere,
          appointmentStartAt: { gte: now, lte: arrivalWindowEnd },
        },
        orderBy: { appointmentStartAt: 'asc' },
        take: 20,
      }),
      this.prisma.lead.findMany({
        where: {
          ...commonWhere,
          appointmentStartAt: { lte: noShowCutoff },
        },
        orderBy: { appointmentStartAt: 'asc' },
        take: 20,
      }),
      this.prisma.lead.findMany({
        where: {
          tenantId,
          status: { in: ACTIVE_RECEPTION_STATUSES },
          nextFollowUpAt: { lte: now },
          convertedServiceOrderId: null,
        },
        orderBy: { nextFollowUpAt: 'asc' },
        take: 20,
      }),
      this.prisma.lead.findMany({
        where: {
          tenantId,
          status: 'CLIENTE_CHEGOU',
          checkedInAt: { not: null },
          convertedServiceOrderId: null,
        },
        orderBy: { checkedInAt: 'asc' },
        take: 20,
      }),
    ]);

    return {
      generatedAt: now.toISOString(),
      arrivalWindowMinutes: RECEPTION_ALERT_ARRIVAL_WINDOW_MINUTES,
      noShowToleranceMinutes: RECEPTION_ALERT_NO_SHOW_TOLERANCE_MINUTES,
      upcomingArrivals: upcomingRows.map((lead) => {
        const appointmentTime = lead.appointmentStartAt?.getTime() ?? now.getTime();
        return {
          ...this.toDto(lead),
          minutesUntilAppointment: Math.max(
            0,
            Math.round((appointmentTime - now.getTime()) / 60_000),
          ),
          minutesLate: null,
          alertReason: 'Cliente perto do horário de chegada.',
        };
      }),
      noShowCandidates: noShowRows.map((lead) => {
        const appointmentTime = lead.appointmentStartAt?.getTime() ?? now.getTime();
        return {
          ...this.toDto(lead),
          minutesUntilAppointment: null,
          minutesLate: Math.max(
            0,
            Math.round((now.getTime() - appointmentTime) / 60_000),
          ),
          alertReason: 'Horário já passou. Registre chegada ou não comparecimento.',
        };
      }),
      overdueFollowUps: overdueFollowUpRows.map((lead) => {
        const followUpTime = lead.nextFollowUpAt?.getTime() ?? now.getTime();
        return {
          ...this.toDto(lead),
          minutesUntilAppointment: null,
          minutesLate: Math.max(
            0,
            Math.round((now.getTime() - followUpTime) / 60_000),
          ),
          alertReason: 'Retorno combinado vencido.',
        };
      }),
      checkedInWithoutOs: checkedInRows.map((lead) => {
        const checkedInTime = lead.checkedInAt?.getTime() ?? now.getTime();
        return {
          ...this.toDto(lead),
          minutesUntilAppointment: null,
          minutesLate: Math.max(
            0,
            Math.round((now.getTime() - checkedInTime) / 60_000),
          ),
          alertReason: 'Cliente chegou e ainda nao virou OS.',
        };
      }),
    };
  }

  async findOne(tenantId: string, id: string): Promise<LeadDetailDto> {
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId },
      include: leadDetailInclude,
    });
    if (!lead) throw new NotFoundException('Atendimento não encontrado');
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
      if (!current) throw new NotFoundException('Atendimento não encontrado');
      await tx.lead.update({
        where: { id },
        data: {
          status,
          closedAt: ['CONVERTIDO', 'NAO_COMPARECEU', 'CANCELADO', 'PERDIDO', 'DUPLICADO', 'INVALIDO', 'DESCARTADO'].includes(status)
            ? new Date()
            : null,
        },
      });
      await this.recordEvent(tx, {
        tenantId: actor.tenantId,
        leadId: id,
        actor,
        type: 'STATUS_CHANGE',
        title: 'Status do atendimento alterado',
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
      if (!lead) throw new NotFoundException('Atendimento não encontrado');

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
      const now = new Date();
      await tx.lead.update({
        where: { id },
        data: {
          status,
          assignedToId: actor.id,
          assignedToName: actor.email,
          nextFollowUpAt: input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null,
          appointmentConfirmedAt: input.outcome === 'CONFIRMOU_AGENDAMENTO' ? now : undefined,
          checkedInAt: input.outcome === 'CLIENTE_CHEGOU' ? now : undefined,
          noShowAt: input.outcome === 'NAO_COMPARECEU' ? now : undefined,
          appointmentCanceledAt: input.outcome === 'CANCELOU_AGENDAMENTO' ? now : undefined,
          closedAt: ['NAO_COMPARECEU', 'CANCELADO', 'PERDIDO', 'INVALIDO'].includes(status) ? now : null,
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
      CONFIRMOU_AGENDAMENTO: 'CONFIRMADO',
      CLIENTE_CHEGOU: 'CLIENTE_CHEGOU',
      NAO_COMPARECEU: 'NAO_COMPARECEU',
      CANCELOU_AGENDAMENTO: 'CANCELADO',
      SEM_INTERESSE: 'PERDIDO',
      JA_RESOLVEU: 'PERDIDO',
      ORCAMENTO_ENVIADO: 'CONTATO_REALIZADO',
      CONVERTIDO_OS: 'CONVERTIDO',
    };
    return statuses[outcome];
  }

  async schedule(
    actor: AuthenticatedUser,
    id: string,
    input: ScheduleLeadInput,
  ): Promise<LeadDetailDto> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.lead.findFirst({
        where: { id, tenantId: actor.tenantId },
        select: {
          id: true,
          appointmentStartAt: true,
          appointmentEndAt: true,
          convertedServiceOrderId: true,
        },
      });
      if (!current) throw new NotFoundException('Atendimento não encontrado');
      if (current.convertedServiceOrderId) {
        throw new ConflictException('Atendimento já convertido em OS');
      }

      const appointmentStartAt = new Date(input.appointmentStartAt);
      const appointmentEndAt = input.appointmentEndAt
        ? new Date(input.appointmentEndAt)
        : new Date(appointmentStartAt.getTime());
      if (appointmentEndAt < appointmentStartAt) {
        throw new BadRequestException('O horário final não pode ser menor que o horário inicial');
      }

      await tx.lead.update({
        where: { id },
        data: {
          status: 'AGENDADO',
          assignedToId: actor.id,
          assignedToName: actor.email,
          appointmentStartAt,
          appointmentEndAt,
          appointmentServiceType: input.appointmentServiceType ?? null,
          appointmentNotes: input.appointmentNotes ?? null,
          appointmentConfirmedAt: null,
          checkedInAt: null,
          noShowAt: null,
          appointmentCanceledAt: null,
          closedAt: null,
        },
      });

      await this.recordEvent(tx, {
        tenantId: actor.tenantId,
        leadId: id,
        actor,
        type: current.appointmentStartAt ? 'APPOINTMENT_RESCHEDULED' : 'APPOINTMENT_SCHEDULED',
        title: current.appointmentStartAt ? 'Agendamento remarcado' : 'Agendamento criado',
        description: input.appointmentNotes ?? input.appointmentServiceType ?? null,
        metadata: {
          previousStartAt: current.appointmentStartAt?.toISOString() ?? null,
          previousEndAt: current.appointmentEndAt?.toISOString() ?? null,
          appointmentStartAt: appointmentStartAt.toISOString(),
          appointmentEndAt: appointmentEndAt.toISOString(),
          appointmentServiceType: input.appointmentServiceType ?? null,
        },
      });
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'SCHEDULE',
      module: 'leads',
      entity: 'Lead',
      entityId: id,
    });

    return this.findOne(actor.tenantId, id);
  }

  async confirmAppointment(
    actor: AuthenticatedUser,
    id: string,
    input: AppointmentActionInput,
  ): Promise<LeadDetailDto> {
    return this.applyAppointmentAction(actor, id, {
      status: 'CONFIRMADO',
      eventType: 'APPOINTMENT_CONFIRMED',
      eventTitle: 'Agendamento confirmado',
      notes: input.notes,
      data: { appointmentConfirmedAt: new Date(), closedAt: null },
    });
  }

  async checkIn(
    actor: AuthenticatedUser,
    id: string,
    input: AppointmentActionInput,
  ): Promise<LeadDetailDto> {
    return this.applyAppointmentAction(actor, id, {
      status: 'CLIENTE_CHEGOU',
      eventType: 'CHECKED_IN',
      eventTitle: 'Cliente chegou',
      notes: input.notes,
      data: { checkedInAt: new Date(), closedAt: null },
    });
  }

  async noShow(
    actor: AuthenticatedUser,
    id: string,
    input: AppointmentActionInput,
  ): Promise<LeadDetailDto> {
    return this.applyAppointmentAction(actor, id, {
      status: 'NAO_COMPARECEU',
      eventType: 'APPOINTMENT_NO_SHOW',
      eventTitle: 'Cliente não compareceu',
      notes: input.notes,
      data: { noShowAt: new Date(), closedAt: new Date() },
    });
  }

  async cancelCheckIn(
    actor: AuthenticatedUser,
    id: string,
    input: AppointmentActionInput,
  ): Promise<LeadDetailDto> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.lead.findFirst({
        where: { id, tenantId: actor.tenantId },
        select: {
          id: true,
          appointmentStartAt: true,
          appointmentConfirmedAt: true,
          checkedInAt: true,
          convertedServiceOrderId: true,
          status: true,
        },
      });
      if (!current) throw new NotFoundException('Atendimento não encontrado');
      if (!current.appointmentStartAt) {
        throw new BadRequestException('Crie um agendamento antes desta ação');
      }
      if (current.convertedServiceOrderId) {
        throw new ConflictException('Atendimento já convertido em OS');
      }
      if (!current.checkedInAt && current.status !== 'CLIENTE_CHEGOU') {
        throw new BadRequestException('A chegada do cliente ainda não foi registrada');
      }

      const status: LeadStatus = current.appointmentConfirmedAt ? 'CONFIRMADO' : 'AGENDADO';

      await tx.lead.update({
        where: { id },
        data: {
          status,
          checkedInAt: null,
          noShowAt: null,
          appointmentCanceledAt: null,
          closedAt: null,
          assignedToId: actor.id,
          assignedToName: actor.email,
        },
      });

      await this.recordEvent(tx, {
        tenantId: actor.tenantId,
        leadId: id,
        actor,
        type: 'CHECK_IN_CANCELED',
        title: 'Chegada do cliente cancelada',
        description: input.notes ?? null,
        metadata: { restoredStatus: status },
      });
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'CANCEL_CHECK_IN',
      module: 'leads',
      entity: 'Lead',
      entityId: id,
    });

    return this.findOne(actor.tenantId, id);
  }

  async cancelAppointment(
    actor: AuthenticatedUser,
    id: string,
    input: AppointmentActionInput,
  ): Promise<LeadDetailDto> {
    return this.applyAppointmentAction(actor, id, {
      status: 'CANCELADO',
      eventType: 'APPOINTMENT_CANCELED',
      eventTitle: 'Agendamento cancelado',
      notes: input.notes,
      data: { appointmentCanceledAt: new Date(), closedAt: new Date() },
    });
  }

  private async applyAppointmentAction(
    actor: AuthenticatedUser,
    id: string,
    input: {
      status: LeadStatus;
      eventType: string;
      eventTitle: string;
      notes?: string;
      data: Prisma.LeadUpdateInput;
    },
  ): Promise<LeadDetailDto> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.lead.findFirst({
        where: { id, tenantId: actor.tenantId },
        select: { id: true, appointmentStartAt: true, convertedServiceOrderId: true },
      });
      if (!current) throw new NotFoundException('Atendimento não encontrado');
      if (!current.appointmentStartAt) {
        throw new BadRequestException('Crie um agendamento antes desta ação');
      }
      if (current.convertedServiceOrderId) {
        throw new ConflictException('Atendimento já convertido em OS');
      }

      await tx.lead.update({
        where: { id },
        data: {
          ...input.data,
          status: input.status,
          assignedToId: actor.id,
          assignedToName: actor.email,
        },
      });
      await this.recordEvent(tx, {
        tenantId: actor.tenantId,
        leadId: id,
        actor,
        type: input.eventType,
        title: input.eventTitle,
        description: input.notes ?? null,
      });
    });

    return this.findOne(actor.tenantId, id);
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
      if (!lead) throw new NotFoundException('Atendimento não encontrado');

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
        title: 'Cliente vinculado ao atendimento',
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
      if (!lead) throw new NotFoundException('Atendimento não encontrado');

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
        title: 'Veículo vinculado ao atendimento',
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
          if (!lead) throw new NotFoundException('Atendimento não encontrado');
          if (lead.convertedServiceOrderId) {
            throw new ConflictException('Atendimento já convertido em OS');
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
                  note: `OS aberta a partir do atendimento ${lead.name}`,
                },
              },
              events: {
                create: {
                  tenantId: actor.tenantId,
                  type: 'STATUS_CHANGE',
                  title: 'OS criada a partir do atendimento',
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
            description: 'Cliente, veículo e ordem de serviço registrados a partir do atendimento.',
            metadata: { serviceOrderId: order.id, customerId, vehicleId },
          });
        }),
      'Não foi possível converter o atendimento em OS',
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
        notes: input.customer.notes ?? `Criado a partir do atendimento: ${lead.message}`,
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
