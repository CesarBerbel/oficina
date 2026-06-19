import { Injectable, NotFoundException } from '@nestjs/common';
import type { PlatformSessionDto } from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Injectable()
export class PlatformSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listActive(): Promise<PlatformSessionDto[]> {
    const rows = await this.prisma.refreshToken.findMany({
      where: {
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true,
        userId: true,
        userAgent: true,
        ip: true,
        expiresAt: true,
        createdAt: true,
        user: {
          select: {
            name: true,
            email: true,
            role: true,
            superAdmin: true,
            tenant: {
              select: {
                id: true,
                name: true,
                slug: true,
                account: {
                  select: {
                    name: true,
                    slug: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      userName: row.user.name,
      userEmail: row.user.email,
      role: row.user.role,
      platformAdmin: row.user.superAdmin,
      tenantId: row.user.tenant.id,
      tenantName: row.user.tenant.name,
      tenantSlug: row.user.tenant.slug,
      accountName: row.user.tenant.account.name,
      accountSlug: row.user.tenant.account.slug,
      ip: row.ip,
      userAgent: row.userAgent,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    }));
  }

  async revokeSession(actor: AuthenticatedUser, id: string): Promise<void> {
    const session = await this.prisma.refreshToken.findFirst({
      where: { id, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, userId: true, user: { select: { tenantId: true } } },
    });
    if (!session) throw new NotFoundException('Sessão ativa não encontrada');
    await this.prisma.refreshToken.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'PLATFORM_REVOKE_SESSION',
      module: 'platform-sessions',
      entity: 'RefreshToken',
      entityId: id,
      after: { targetUserId: session.userId, targetTenantId: session.user.tenantId },
    });
  }

  async revokeAllForUser(actor: AuthenticatedUser, userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, tenantId: true, email: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'PLATFORM_LOGOUT_USER_ALL',
      module: 'platform-sessions',
      entity: 'User',
      entityId: userId,
      after: { targetTenantId: user.tenantId, targetEmail: user.email, revoked: result.count },
    });
  }
}
