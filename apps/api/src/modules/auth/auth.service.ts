import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import {
  composeAddress,
  permissionsForRole,
  type InstallSystemInput,
  type LoginResponse,
} from '@oficina/shared';
import { Prisma, type Role } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PasswordService } from '../../infra/security/password.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../../infra/mail/mail.service';
import { seedMessageTemplates } from '../messaging/default-templates';
import { seedDefaultCategories } from '../categories/default-categories';
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
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private appUrl(): string {
    return (
      this.config.get<string>('APP_URL') ??
      this.config.get<string>('WEB_URL') ??
      this.config.get<string>('FRONTEND_URL') ??
      'http://localhost:3000'
    ).replace(/\/$/, '');
  }

  private buildAuthUser(user: {
    id: string;
    tenantId: string;
    name: string;
    email: string;
    role: Role;
    forcePasswordChange: boolean;
    superAdmin: boolean;
  }) {
    return {
      id: user.id,
      tenantId: user.tenantId,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: permissionsForRole(user.role),
      forcePasswordChange: user.forcePasswordChange,
      platformAdmin: user.superAdmin,
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

  /** O sistema já foi instalado (existe ao menos uma oficina)? */
  async installStatus(): Promise<{ installed: boolean }> {
    const count = await this.prisma.tenant.count();
    return { installed: count > 0 };
  }

  /**
   * Instalação do sistema: cria a oficina matriz + super usuário + configurações
   * do site + categorias/marcas/templates padrão e já autentica. Só é permitida
   * com o sistema vazio (nenhuma oficina cadastrada).
   */
  async install(
    input: InstallSystemInput,
    meta: RequestMeta,
  ): Promise<IssuedSession> {
    const count = await this.prisma.tenant.count();
    if (count > 0) {
      throw new ConflictException('O sistema já está instalado.');
    }

    const slug = input.slug.trim().toLowerCase();
    const passwordHash = await this.passwords.hash(input.password);

    let tenantId: string;
    let admin: {
      id: string;
      tenantId: string;
      name: string;
      email: string;
      role: Role;
      forcePasswordChange: boolean;
      superAdmin: boolean;
    };
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Matriz: parentId null.
        const tenant = await tx.tenant.create({
          data: {
            name: input.shopName,
            slug,
            cnpj: input.cnpj ?? null,
            parentId: null,
          },
        });
        // Super usuário (acesso global a todas as oficinas).
        const user = await tx.user.create({
          data: {
            tenantId: tenant.id,
            name: input.adminName,
            email: input.adminEmail,
            passwordHash,
            role: 'ADMIN',
            active: true,
            superAdmin: true,
            forcePasswordChange: false,
          },
        });
        await tx.siteSettings.create({
          data: {
            tenantId: tenant.id,
            shopName: input.shopName,
            cnpj: input.cnpj ?? null,
            phone: input.phone ?? null,
            whatsapp: input.whatsapp ?? null,
            email: input.email ?? null,
            tagline: input.tagline ?? null,
            addressZip: input.addressZip ?? null,
            addressStreet: input.addressStreet ?? null,
            addressNumber: input.addressNumber ?? null,
            addressComplement: input.addressComplement ?? null,
            addressDistrict: input.addressDistrict ?? null,
            addressCity: input.addressCity ?? null,
            addressState: input.addressState ?? null,
            address: composeAddress({
              addressStreet: input.addressStreet,
              addressNumber: input.addressNumber,
              addressComplement: input.addressComplement,
              addressDistrict: input.addressDistrict,
              addressCity: input.addressCity,
              addressState: input.addressState,
              addressZip: input.addressZip,
            }),
          },
        });
        return { tenant, user };
      });
      tenantId = result.tenant.id;
      admin = result.user;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('O sistema já está instalado.');
      }
      throw err;
    }

    // Categorias/marcas e templates padrão (best-effort: não bloqueiam a instalação).
    try {
      await seedDefaultCategories(this.prisma, tenantId);
      await seedMessageTemplates(this.prisma, tenantId);
    } catch (err) {
      this.logger.warn(
        `Falha ao semear dados padrão na instalação (${tenantId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    await this.audit.record({
      tenantId,
      userId: admin.id,
      action: 'INSTALL_SYSTEM',
      module: 'auth',
      entity: 'Tenant',
      entityId: tenantId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    const accessToken = this.issueAccessToken(admin);
    const refresh = await this.createRefreshToken(admin.id, meta);

    return {
      accessToken,
      user: this.buildAuthUser(admin),
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
    };
  }

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

  async requestPasswordReset(
    tenantSlug: string,
    email: string,
    meta: RequestMeta,
  ): Promise<{ ok: true }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true, name: true, active: true },
    });

    const user = tenant?.active
      ? await this.prisma.user.findUnique({
          where: { tenantId_email: { tenantId: tenant.id, email } },
          select: { id: true, tenantId: true, name: true, email: true, active: true },
        })
      : null;

    if (tenant?.active && user?.active) {
      await this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });

      const token = randomBytes(32).toString('hex');
      await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: this.hashToken(token),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });

      const resetUrl = `${this.appUrl()}/redefinir-senha?token=${token}`;
      const text = [
        `Olá, ${user.name}.`,
        '',
        `Recebemos uma solicitação para redefinir sua senha na ${tenant.name}.`,
        `Acesse o link abaixo para criar uma nova senha. Ele expira em 1 hora:`,
        resetUrl,
        '',
        'Se você não solicitou isso, ignore este e-mail.',
      ].join('\n');

      const mailResult = await this.mail.send({
        to: user.email,
        subject: 'Redefinição de senha - Oficina',
        text,
        html: text.replace(/\n/g, '<br />'),
      });

      if (mailResult.skipped) {
        this.logger.warn(
          `SMTP não configurado. Link de redefinição para ${user.email}: ${resetUrl}`,
        );
      }

      await this.audit.record({
        tenantId: user.tenantId,
        userId: user.id,
        action: 'REQUEST_PASSWORD_RESET',
        module: 'auth',
        entity: 'User',
        entityId: user.id,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    }

    return { ok: true };
  }

  async resetPassword(token: string, password: string): Promise<{ ok: true }> {
    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: { user: true },
    });

    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new BadRequestException('Link inválido ou expirado');
    }
    if (!stored.user.active) {
      throw new ForbiddenException('Usuário inativo. Procure o administrador.');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: stored.userId },
        data: {
          passwordHash: await this.passwords.hash(password),
          forcePasswordChange: false,
        },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      tenantId: stored.user.tenantId,
      userId: stored.userId,
      action: 'RESET_PASSWORD',
      module: 'auth',
      entity: 'User',
      entityId: stored.userId,
    });

    return { ok: true };
  }

  async changePassword(
    userId: string,
    password: string,
    currentPassword?: string,
  ): Promise<{ ok: true }> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, active: true, tenant: { active: true } },
    });
    if (!user) throw new UnauthorizedException('Sessão inválida');

    if (!user.forcePasswordChange) {
      if (!currentPassword) throw new BadRequestException('Informe a senha atual');
      const ok = await this.passwords.verify(user.passwordHash, currentPassword);
      if (!ok) throw new BadRequestException('Senha atual inválida');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await this.passwords.hash(password),
          forcePasswordChange: false,
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'CHANGE_PASSWORD',
      module: 'auth',
      entity: 'User',
      entityId: user.id,
    });

    return { ok: true };
  }
}
