import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuditLogDto, ListAuditQuery, Paginated } from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface AuditEntry {
  tenantId: string;
  userId?: string | null;
  action: string;
  module: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Registra eventos de auditoria. Nunca lança erro para o fluxo principal:
 * uma falha de auditoria não deve quebrar a operação de negócio.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: entry.tenantId,
          userId: entry.userId ?? null,
          action: entry.action,
          module: entry.module,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          before: (entry.before ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          after: (entry.after ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          ip: entry.ip ?? null,
          userAgent: entry.userAgent ?? null,
        },
      });
    } catch (err) {
      this.logger.error(
        `Falha ao registrar auditoria (${entry.module}/${entry.action})`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  async list(
    tenantId: string,
    query: ListAuditQuery,
  ): Promise<Paginated<AuditLogDto>> {
    const { page, pageSize, module, action } = query;
    const where: Prisma.AuditLogWhereInput = {
      tenantId,
      ...(module ? { module } : {}),
      ...(action ? { action } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        action: r.action,
        module: r.module,
        entity: r.entity,
        entityId: r.entityId,
        userName: r.user?.name ?? null,
        ip: r.ip,
        before: r.before,
        after: r.after,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }
}
