import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type CategoryKind } from '@prisma/client';
import type {
  CategoryDto,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

function toDto(c: Prisma.CategoryGetPayload<object>): CategoryDto {
  return { id: c.id, kind: c.kind, name: c.name, active: c.active };
}

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Categorias são compartilhadas no grupo (matriz + filiais): escopo por groupId.
  async list(groupId: string, kind?: CategoryKind): Promise<CategoryDto[]> {
    const rows = await this.prisma.category.findMany({
      where: { tenantId: groupId, ...(kind ? { kind } : {}) },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toDto);
  }

  async create(
    actor: AuthenticatedUser,
    input: CreateCategoryInput,
  ): Promise<CategoryDto> {
    const clash = await this.prisma.category.findFirst({
      where: { tenantId: actor.groupId, kind: input.kind, name: input.name },
      select: { id: true },
    });
    if (clash) throw new ConflictException('Já existe uma categoria com este nome');

    const created = await this.prisma.category.create({
      data: {
        tenantId: actor.groupId,
        kind: input.kind,
        name: input.name,
        active: input.active,
      },
    });
    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'CREATE',
      module: 'categories',
      entity: 'Category',
      entityId: created.id,
      after: { kind: created.kind, name: created.name },
    });
    return toDto(created);
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    input: UpdateCategoryInput,
  ): Promise<CategoryDto> {
    const current = await this.prisma.category.findFirst({
      where: { id, tenantId: actor.groupId },
    });
    if (!current) throw new NotFoundException('Categoria não encontrada');

    if (input.name && input.name !== current.name) {
      const clash = await this.prisma.category.findFirst({
        where: {
          tenantId: actor.groupId,
          kind: current.kind,
          name: input.name,
          NOT: { id },
        },
        select: { id: true },
      });
      if (clash) throw new ConflictException('Já existe uma categoria com este nome');
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'UPDATE',
      module: 'categories',
      entity: 'Category',
      entityId: id,
    });
    return toDto(updated);
  }

  async remove(actor: AuthenticatedUser, id: string): Promise<void> {
    const res = await this.prisma.category.deleteMany({
      where: { id, tenantId: actor.groupId },
    });
    if (res.count === 0) throw new NotFoundException('Categoria não encontrada');
    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'DELETE',
      module: 'categories',
      entity: 'Category',
      entityId: id,
    });
  }
}
