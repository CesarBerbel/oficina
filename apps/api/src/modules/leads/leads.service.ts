import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateLeadInput,
  LeadDto,
  ListLeadsQuery,
  Paginated,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private toDto(l: Prisma.LeadGetPayload<object>): LeadDto {
    return {
      id: l.id,
      name: l.name,
      phone: l.phone,
      email: l.email,
      vehicle: l.vehicle,
      message: l.message,
      status: l.status,
      createdAt: l.createdAt.toISOString(),
    };
  }

  /** Criado pelo formulário público do site. */
  async createFromPublic(tenantId: string, input: CreateLeadInput): Promise<void> {
    const lead = await this.prisma.lead.create({
      data: {
        tenantId,
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
        vehicle: input.vehicle ?? null,
        message: input.message,
      },
    });
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
    const { page, pageSize, status } = query;
    const where: Prisma.LeadWhereInput = { tenantId, ...(status ? { status } : {}) };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.lead.count({ where }),
      this.prisma.lead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map((l) => this.toDto(l)),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  async updateStatus(
    actor: AuthenticatedUser,
    id: string,
    status: LeadDto['status'],
  ): Promise<LeadDto> {
    await this.prisma.lead.updateMany({
      where: { id, tenantId: actor.tenantId },
      data: { status },
    });
    const lead = await this.prisma.lead.findFirstOrThrow({
      where: { id, tenantId: actor.tenantId },
    });
    return this.toDto(lead);
  }
}
