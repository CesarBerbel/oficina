import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { permissionsForRole, type LoginResponse } from '@oficina/shared';
import type { Role } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PasswordService } from '../../infra/security/password.service';
import { AuditService } from '../audit/audit.service';
import { durationToMs } from '../../common/utils/duration';
import type { JwtPayload } from '../../common/types/authenticated-user';

interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

export interface IssuedSession extends LoginResponse {
  refreshToken: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private buildAuthUser(user: {
    id: string;
    tenantId: string;
    name: string;
    email: string;
    role: Role;
  }) {
    return {
      id: user.id,
      tenantId: user.tenantId,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: permissionsForRole(user.role),
    };
  }

  private issueAccessToken(user: {
    id: string;
    tenantId: string;
    role: Role;
    email: string;
  }): string {
    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    };
    return this.jwt.sign(payload, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_TTL') ?? '15m',
    });
  }

  private async createRefreshToken(
    userId: string,
    meta: RequestMeta,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(48).toString('hex');
    const ttl = this.config.get<string>('JWT_REFRESH_TTL') ?? '7d';
    const expiresAt = new Date(Date.now() + durationToMs(ttl));
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(token),
        userAgent: meta.userAgent ?? null,
        ip: meta.ip ?? null,
        expiresAt,
      },
    });
    return { token, expiresAt };
  }

  async login(
    tenantSlug: string,
    email: string,
    password: string,
    meta: RequestMeta,
  ): Promise<IssuedSession> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true, active: true },
    });

    const user = tenant?.active
      ? await this.prisma.user.findUnique({
          where: { tenantId_email: { tenantId: tenant.id, email } },
        })
      : null;

    const ok = user
      ? await this.passwords.verify(user.passwordHash, password)
      : false;

    await this.prisma.loginAttempt.create({
      data: {
        tenantId: tenant?.id ?? null,
        email,
        success: ok && !!user?.active && tenant?.active === true,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      },
    });

    if (!tenant || !tenant.active || !user || !ok) {
      throw new UnauthorizedException('Credenciais inválidas');
    }
    if (!user.active) {
      throw new ForbiddenException('Usuário inativo. Procure o administrador.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = this.issueAccessToken(user);
    const refresh = await this.createRefreshToken(user.id, meta);

    await this.audit.record({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'LOGIN',
      module: 'auth',
      entity: 'User',
      entityId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return {
      accessToken,
      user: this.buildAuthUser(user),
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
    };
  }

  /** Valida o refresh token, rotaciona (revoga o antigo, cria um novo). */
  async refresh(rawToken: string, meta: RequestMeta): Promise<IssuedSession> {
    if (!rawToken) throw new UnauthorizedException('Sessão expirada');

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(rawToken) },
      include: { user: { include: { tenant: true } } },
    });

    if (
      !stored ||
      stored.revokedAt ||
      stored.expiresAt < new Date() ||
      !stored.user.active ||
      !stored.user.tenant.active
    ) {
      throw new UnauthorizedException('Sessão inválida ou expirada');
    }

    // Rotação: revoga o token atual e emite um novo.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const accessToken = this.issueAccessToken(stored.user);
    const refresh = await this.createRefreshToken(stored.user.id, meta);

    return {
      accessToken,
      user: this.buildAuthUser(stored.user),
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
    };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, active: true, tenant: { active: true } },
    });
    if (!user) {
      throw new UnauthorizedException('Sessão inválida');
    }
    return this.buildAuthUser(user);
  }
}
