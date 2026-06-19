import { Injectable } from '@nestjs/common';
import type { PlatformSessionDto } from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class PlatformSessionsService {
  constructor(private readonly prisma: PrismaService) {}

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
}
