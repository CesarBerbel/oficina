import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Role } from '@prisma/client';
import type {
  CreateUserInput,
  ListUsersQuery,
  Paginated,
  UpdateUserInput,
  UserDto,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PasswordService } from '../../infra/security/password.service';
import { AuditService } from '../audit/audit.service';
import { QuotasService } from '../saas/quotas.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  forcePasswordChange: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

function toDto(u: UserRow): UserDto {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    forcePasswordChange: u.forcePasswordChange,
    createdAt: u.createdAt.toISOString(),
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
    private readonly quotas: QuotasService,
  ) {}

  async list(tenantId: string, query: ListUsersQuery): Promise<Paginated<UserDto>> {
    const { page, pageSize, search, role, active, sortBy, sortOrder } = query;

    const where: Prisma.UserWhereInput = {
      tenantId,
      ...(role ? { role: role as Role } : {}),
      ...(active !== undefined ? { active } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.UserOrderByWithRelationInput = {
      [sortBy && ['name', 'email', 'createdAt'].includes(sortBy) ? sortBy : 'createdAt']: sortOrder,
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: userSelect,
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

  async findOne(tenantId: string, id: string): Promise<UserDto> {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      select: userSelect,
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return toDto(user);
  }

  async create(actor: AuthenticatedUser, input: CreateUserInput): Promise<UserDto> {
    const email = input.email.toLowerCase();
    const exists = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: actor.tenantId, email } },
    });
    if (exists) throw new ConflictException('Já existe um usuário com este e-mail');

    const accountId = await this.quotas.accountIdForTenant(actor.tenantId);
    const usersInAccount = await this.prisma.user.count({
      where: { tenant: { accountId }, active: true },
    });
    await this.quotas.assertAccountLimit(accountId, 'USERS', usersInAccount, 1);

    const passwordHash = await this.passwords.hash(input.password);
    const created = await this.prisma.user.create({
      data: {
        tenantId: actor.tenantId,
        name: input.name,
        email,
        passwordHash,
        role: input.role as Role,
        forcePasswordChange: input.forcePasswordChange ?? true,
      },
      select: userSelect,
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'CREATE',
      module: 'users',
      entity: 'User',
      entityId: created.id,
      after: toDto(created),
    });

    return toDto(created);
  }

  async update(actor: AuthenticatedUser, id: string, input: UpdateUserInput): Promise<UserDto> {
    const current = await this.prisma.user.findFirst({
      where: { id, tenantId: actor.tenantId },
      select: userSelect,
    });
    if (!current) throw new NotFoundException('Usuário não encontrado');

    if (input.email) {
      const email = input.email.toLowerCase();
      const clash = await this.prisma.user.findFirst({
        where: { tenantId: actor.tenantId, email, NOT: { id } },
      });
      if (clash) throw new ConflictException('E-mail já em uso por outro usuário');
    }

    const data: Prisma.UserUpdateInput = {
      ...(input.name ? { name: input.name } : {}),
      ...(input.email ? { email: input.email.toLowerCase() } : {}),
      ...(input.role ? { role: input.role as Role } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.forcePasswordChange !== undefined
        ? { forcePasswordChange: input.forcePasswordChange }
        : {}),
      ...(input.password
        ? {
            passwordHash: await this.passwords.hash(input.password),
            forcePasswordChange: input.forcePasswordChange ?? true,
          }
        : {}),
    };

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: userSelect,
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'UPDATE',
      module: 'users',
      entity: 'User',
      entityId: id,
      before: toDto(current),
      after: toDto(updated),
    });

    return toDto(updated);
  }

  async setActive(actor: AuthenticatedUser, id: string, active: boolean): Promise<UserDto> {
    if (id === actor.id && !active) {
      throw new BadRequestException('Você não pode inativar a si mesmo');
    }
    const current = await this.prisma.user.findFirst({
      where: { id, tenantId: actor.tenantId },
      select: userSelect,
    });
    if (!current) throw new NotFoundException('Usuário não encontrado');

    // Não permite remover o último admin ativo.
    if (current.role === 'ADMIN' && current.active && !active) {
      const activeAdmins = await this.prisma.user.count({
        where: { tenantId: actor.tenantId, role: 'ADMIN', active: true },
      });
      if (activeAdmins <= 1) {
        throw new ForbiddenException('Não é possível inativar o último administrador ativo');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { active },
      select: userSelect,
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: active ? 'ACTIVATE' : 'DEACTIVATE',
      module: 'users',
      entity: 'User',
      entityId: id,
      before: { active: current.active },
      after: { active },
    });

    return toDto(updated);
  }
}
