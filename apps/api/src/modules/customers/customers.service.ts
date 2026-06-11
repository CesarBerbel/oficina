import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateCustomerInput,
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
    vehiclesCount: c._count.vehicles,
    createdAt: c.createdAt.toISOString(),
  };
}

const withCount = {
  include: { _count: { select: { vehicles: true } } },
} satisfies Prisma.CustomerDefaultArgs;

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

    const created = await this.prisma.customer.create({
      data: { tenantId: actor.tenantId, ...input },
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

    const updated = await this.prisma.customer.update({
      where: { id },
      data: input,
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
