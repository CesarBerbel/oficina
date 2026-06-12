import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreatePartInput,
  ListPartsQuery,
  Paginated,
  PartDto,
  StockMovementDto,
  StockMovementInput,
  UpdatePartInput,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { applyStockMovement } from './stock.helper';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const dec = (v: Prisma.Decimal | number | null | undefined): number =>
  v == null ? 0 : Number(v);
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

const partInclude = {
  supplierRef: { select: { name: true } },
} satisfies Prisma.PartInclude;

type PartRow = Prisma.PartGetPayload<{ include: typeof partInclude }>;

function toDto(p: PartRow): PartDto {
  const currentStock = dec(p.currentStock);
  const reservedStock = dec(p.reservedStock);
  const minStock = dec(p.minStock);
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    ean: p.ean,
    type: p.type,
    category: p.category,
    brand: p.brand,
    unit: p.unit,
    currentStock,
    reservedStock,
    availableStock: round3(currentStock - reservedStock),
    minStock,
    costPrice: dec(p.costPrice),
    salePrice: dec(p.salePrice),
    supplier: p.supplier,
    supplierId: p.supplierId,
    supplierName: p.supplierRef?.name ?? null,
    description: p.description,
    active: p.active,
    lowStock: currentStock <= minStock,
  };
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    tenantId: string,
    query: ListPartsQuery,
  ): Promise<Paginated<PartDto>> {
    const { page, pageSize, search, type, lowStock, sortBy, sortOrder } = query;
    const where: Prisma.PartWhereInput = {
      tenantId,
      ...(type ? { type } : {}),
      ...(lowStock
        ? { currentStock: { lte: this.prisma.part.fields.minStock } }
        : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
              { ean: { contains: search } },
              { brand: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.PartOrderByWithRelationInput = {
      [sortBy && ['name', 'currentStock'].includes(sortBy) ? sortBy : 'name']:
        sortBy ? sortOrder : 'asc',
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.part.count({ where }),
      this.prisma.part.findMany({
        where,
        include: partInclude,
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

  async findOne(tenantId: string, id: string): Promise<PartDto> {
    const part = await this.prisma.part.findFirst({
      where: { id, tenantId },
      include: partInclude,
    });
    if (!part) throw new NotFoundException('Peça não encontrada');
    return toDto(part);
  }

  /** Garante que o fornecedor informado existe no tenant. */
  private async assertSupplier(
    tenantId: string,
    supplierId: string | undefined,
  ): Promise<void> {
    if (!supplierId) return;
    const s = await this.prisma.supplier.findFirst({
      where: { id: supplierId, tenantId },
      select: { id: true },
    });
    if (!s) throw new NotFoundException('Fornecedor inválido');
  }

  async create(
    actor: AuthenticatedUser,
    input: CreatePartInput,
  ): Promise<PartDto> {
    if (input.sku) {
      const clash = await this.prisma.part.findFirst({
        where: { tenantId: actor.tenantId, sku: input.sku },
      });
      if (clash) throw new ConflictException('Já existe uma peça com este SKU');
    }
    await this.assertSupplier(actor.tenantId, input.supplierId);

    const { initialStock, ...data } = input;

    const part = await this.prisma.$transaction(async (tx) => {
      const created = await tx.part.create({
        data: {
          tenantId: actor.tenantId,
          ...data,
          currentStock: 0,
        },
      });
      if (initialStock && initialStock > 0) {
        await applyStockMovement(tx, {
          tenantId: actor.tenantId,
          partId: created.id,
          type: 'ENTRADA',
          quantity: initialStock,
          unitCost: data.costPrice ?? null,
          note: 'Estoque inicial',
          userId: actor.id,
        });
      }
      return tx.part.findUniqueOrThrow({
        where: { id: created.id },
        include: partInclude,
      });
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'CREATE',
      module: 'inventory',
      entity: 'Part',
      entityId: part.id,
      after: { name: part.name, sku: part.sku },
    });

    return toDto(part);
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    input: UpdatePartInput,
  ): Promise<PartDto> {
    const current = await this.prisma.part.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!current) throw new NotFoundException('Peça não encontrada');

    if (input.sku && input.sku !== current.sku) {
      const clash = await this.prisma.part.findFirst({
        where: { tenantId: actor.tenantId, sku: input.sku, NOT: { id } },
      });
      if (clash) throw new ConflictException('SKU já usado por outra peça');
    }
    await this.assertSupplier(actor.tenantId, input.supplierId);

    const updated = await this.prisma.part.update({
      where: { id },
      data: input,
      include: partInclude,
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'UPDATE',
      module: 'inventory',
      entity: 'Part',
      entityId: id,
    });

    return toDto(updated);
  }

  async movements(
    tenantId: string,
    partId: string,
  ): Promise<StockMovementDto[]> {
    const part = await this.prisma.part.findFirst({
      where: { id: partId, tenantId },
      select: { id: true },
    });
    if (!part) throw new NotFoundException('Peça não encontrada');

    const rows = await this.prisma.stockMovement.findMany({
      where: { partId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: { select: { name: true } } },
    });

    return rows.map((m) => ({
      id: m.id,
      type: m.type,
      quantity: dec(m.quantity),
      unitCost: m.unitCost != null ? dec(m.unitCost) : null,
      balanceAfter: dec(m.balanceAfter),
      note: m.note,
      userName: m.user?.name ?? null,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  async move(
    actor: AuthenticatedUser,
    partId: string,
    input: StockMovementInput,
  ): Promise<PartDto> {
    const part = await this.prisma.part.findFirst({
      where: { id: partId, tenantId: actor.tenantId },
      select: { id: true },
    });
    if (!part) throw new NotFoundException('Peça não encontrada');

    await this.prisma.$transaction(async (tx) => {
      await applyStockMovement(tx, {
        tenantId: actor.tenantId,
        partId,
        type: input.type,
        quantity: input.quantity,
        unitCost: input.unitCost ?? null,
        note: input.note ?? null,
        userId: actor.id,
        setAbsolute: input.type === 'AJUSTE',
      });
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'STOCK_MOVE',
      module: 'inventory',
      entity: 'Part',
      entityId: partId,
      after: { type: input.type, quantity: input.quantity },
    });

    return this.findOne(actor.tenantId, partId);
  }
}
