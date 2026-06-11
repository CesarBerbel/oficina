import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateSupplierInput,
  ListSuppliersQuery,
  Paginated,
  SupplierDto,
  UpdateSupplierInput,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

type SupplierRow = Prisma.SupplierGetPayload<object>;

function toDto(s: SupplierRow): SupplierDto {
  return {
    id: s.id,
    name: s.name,
    document: s.document,
    phone: s.phone,
    email: s.email,
    notes: s.notes,
    active: s.active,
  };
}

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    tenantId: string,
    query: ListSuppliersQuery,
  ): Promise<Paginated<SupplierDto>> {
    const { page, pageSize, search } = query;
    const where: Prisma.SupplierWhereInput = {
      tenantId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { document: { contains: search.replace(/\D/g, '') } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.supplier.count({ where }),
      this.prisma.supplier.findMany({
        where,
        orderBy: { name: 'asc' },
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

  async create(
    actor: AuthenticatedUser,
    input: CreateSupplierInput,
  ): Promise<SupplierDto> {
    const created = await this.prisma.supplier.create({
      data: { tenantId: actor.tenantId, ...input },
    });
    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'CREATE',
      module: 'suppliers',
      entity: 'Supplier',
      entityId: created.id,
      after: { name: created.name },
    });
    return toDto(created);
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    input: UpdateSupplierInput,
  ): Promise<SupplierDto> {
    const current = await this.prisma.supplier.findFirst({
      where: { id, tenantId: actor.tenantId },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('Fornecedor não encontrado');
    const updated = await this.prisma.supplier.update({
      where: { id },
      data: input,
    });
    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'UPDATE',
      module: 'suppliers',
      entity: 'Supplier',
      entityId: id,
    });
    return toDto(updated);
  }

  /** Localiza por CNPJ ou cria (usado pela importação de NF-e). */
  async findOrCreateByDocument(
    tenantId: string,
    document: string | null,
    name: string,
  ): Promise<string | null> {
    if (document) {
      const existing = await this.prisma.supplier.findFirst({
        where: { tenantId, document },
        select: { id: true },
      });
      if (existing) return existing.id;
    }
    const created = await this.prisma.supplier.create({
      data: { tenantId, name, document: document ?? null },
      select: { id: true },
    });
    return created.id;
  }
}
