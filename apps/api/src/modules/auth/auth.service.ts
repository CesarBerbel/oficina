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
  permissionsForRole,
  RESERVED_SUBDOMAINS,
  type LoginContextDto,
  type LoginResponse,
  type UserSessionDto,
} from '@oficina/shared';
import { type Role } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PasswordService } from '../../infra/security/password.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../../infra/mail/mail.service';
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

  /**
   * Origem web (scheme + porta do app) no subdomínio de uma conta. Ex.: app em
   * http://localhost:3000 + slug "x" + base "localhost" → http://x.localhost:3000.
   * Sem PLATFORM_BASE_DOMAIN, cai na origem padrão do app (acesso por slug).
   */
  private accountWebOrigin(slug: string): string {
    const app = this.appUrl();
    const base = (process.env.PLATFORM_BASE_DOMAIN ?? '').trim().toLowerCase();
    if (!base) return app;
    try {
      const url = new URL(app);
      url.hostname = `${slug}.${base}`;
      return url.origin;
    } catch {
      return app;
    }
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

  private issueAccessToken(
    user: {
      id: string;
      tenantId: string;
      role: Role;
      email: string;
    },
    sessionId: string,
    sessionVersion: number,
  ): string {
    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
      sid: sessionId,
      sv: sessionVersion,
    };
    return this.jwt.sign(payload, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_TTL') ?? '15m',
    });
  }

  private async createRefreshToken(
    userId: string,
    meta: RequestMeta,
    sessionVersion: number,
  ): Promise<{ id: string; token: string; expiresAt: Date }> {
    const token = randomBytes(48).toString('hex');
    const ttl = this.config.get<string>('JWT_REFRESH_TTL') ?? '7d';
    const expiresAt = new Date(Date.now() + durationToMs(ttl));
    const created = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(token),
        userAgent: meta.userAgent ?? null,
        ip: meta.ip ?? null,
        sessionVersion,
        expiresAt,
      },
      select: { id: true },
    });
    return { id: created.id, token, expiresAt };
  }

  /** Normaliza um host (remove porta, minúsculas, pega o 1º se vier lista). */
  private normalizeHost(host: string | null | undefined): string | null {
    if (!host) return null;
    const h = host.split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
    return h || null;
  }

  /** Verificação exigida (produção) para resolver a conta por domínio. */
  private requireVerifiedDomain(): boolean {
    return (
      (this.config.get<string>('NODE_ENV') ?? process.env.NODE_ENV) === 'production' ||
      process.env.TENANT_DOMAIN_REQUIRE_VERIFIED === 'true'
    );
  }

  /** Resolve a conta dona de um host (subdomínio próprio ou domínio de terceiro). */
  async resolveTenantByHost(host: string | null): Promise<{
    tenantId: string;
    tenantSlug: string;
    account: { id: string; name: string; slug: string; status: string };
  } | null> {
    const h = this.normalizeHost(host);
    if (!h) return null;
    const domain = await this.prisma.tenantDomain.findFirst({
      where: {
        domain: h,
        ...(this.requireVerifiedDomain()
          ? { verifiedAt: { not: null }, status: 'VERIFIED' as const }
          : {}),
      },
      select: {
        tenant: {
          select: {
            id: true,
            slug: true,
            account: { select: { id: true, name: true, slug: true, status: true } },
          },
        },
      },
    });
    return domain
      ? {
          tenantId: domain.tenant.id,
          tenantSlug: domain.tenant.slug,
          account: domain.tenant.account,
        }
      : null;
  }

  /** Resolve a conta dona de um host (subdomínio próprio ou domínio de terceiro). */
  async resolveAccountByHost(
    host: string | null,
  ): Promise<{ id: string; name: string; slug: string; status: string } | null> {
    return (await this.resolveTenantByHost(host))?.account ?? null;
  }

  /** Slug da conta interna da plataforma (lar do super admin). */
  private platformAccountSlug(): string {
    return (process.env.PLATFORM_ACCOUNT_SLUG ?? 'plataforma').trim().toLowerCase();
  }

  /** O host é o apex da plataforma (saecbpa.com / www.saecbpa.com)? */
  isPlatformHost(host: string | null): boolean {
    const h = this.normalizeHost(host);
    const base = (process.env.PLATFORM_BASE_DOMAIN ?? '').trim().toLowerCase();
    if (!h || !base) return false;
    return h === base || h === `www.${base}`;
  }

  /**
   * Alvo do login a partir do host: no apex é a plataforma (só super admin); num
   * subdomínio/domínio próprio é a conta daquela oficina.
   */
  async resolveLoginTarget(
    host: string | null,
  ): Promise<{ accountId: string | null; tenantSlug: string | null; platform: boolean }> {
    if (this.isPlatformHost(host)) {
      const account = await this.prisma.account.findUnique({
        where: { slug: this.platformAccountSlug() },
        select: { id: true },
      });
      return { accountId: account?.id ?? null, tenantSlug: null, platform: true };
    }
    const tenant = await this.resolveTenantByHost(host);
    return {
      accountId: tenant?.account.id ?? null,
      tenantSlug: tenant?.tenantSlug ?? null,
      platform: false,
    };
  }

  /**
   * Subdomínio livre da plataforma (ex.: novaoficina.saecbpa.com sem oficina):
   * devolve o slug sugerido para o cadastro; null se não se aplica.
   */
  private suggestedSlugFor(host: string | null): string | null {
    const h = this.normalizeHost(host);
    const base = (process.env.PLATFORM_BASE_DOMAIN ?? '').trim().toLowerCase();
    if (!h || !base || !h.endsWith(`.${base}`)) return null;
    const label = h.slice(0, -(base.length + 1));
    const ok =
      !!label &&
      label !== 'www' &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(label) &&
      !(RESERVED_SUBDOMAINS as readonly string[]).includes(label);
    return ok ? label : null;
  }

  /** Contexto de login do host (para a tela de login decidir o que mostrar). */
  async loginContext(host: string | null): Promise<LoginContextDto> {
    if (this.isPlatformHost(host)) {
      return {
        account: null,
        tenantSlug: null,
        platform: true,
        suggestedSlug: null,
        pendingRequest: false,
      };
    }
    const tenant = await this.resolveTenantByHost(host);
    if (tenant) {
      const branches = await this.prisma.tenant.findMany({
        where: { accountId: tenant.account.id, active: true },
        orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
        select: { name: true, slug: true },
      });
      return {
        account: { name: tenant.account.name, slug: tenant.account.slug, branches },
        tenantSlug: tenant.tenantSlug,
        platform: false,
        suggestedSlug: null,
        pendingRequest: false,
      };
    }
    // Sem conta: subdomínio livre da base → sugere o slug para o cadastro.
    // Se já houver um pedido pendente para esse slug, sinaliza para a tela
    // mostrar "aguardando aprovação" em vez de pedir o cadastro de novo.
    const suggestedSlug = this.suggestedSlugFor(host);
    const pendingRequest = suggestedSlug
      ? !!(await this.prisma.accountRequest.findFirst({
          where: { slug: suggestedSlug, status: 'PENDING' },
          select: { id: true },
        }))
      : false;
    return {
      account: null,
      tenantSlug: null,
      platform: false,
      suggestedSlug,
      pendingRequest,
    };
  }

  /**
   * Localiza o usuário do login: por conta (host) ou pelo slug da oficina.
   * No modo por conta, busca o e-mail entre as oficinas daquela conta.
   */
  private async findLoginUser(
    opts: { tenantSlug?: string | null; accountId?: string | null },
    email: string,
  ) {
    const include = {
      tenant: { select: { active: true, account: { select: { status: true } } } },
    } as const;
    if (opts.accountId) {
      if (opts.tenantSlug) {
        const tenant = await this.prisma.tenant.findFirst({
          where: { slug: opts.tenantSlug, accountId: opts.accountId },
          select: { id: true },
        });
        if (!tenant) return null;
        return this.prisma.user.findUnique({
          where: { tenantId_email: { tenantId: tenant.id, email } },
          include,
        });
      }
      const users = await this.prisma.user.findMany({
        where: { email, tenant: { accountId: opts.accountId } },
        include,
        take: 2,
        orderBy: { createdAt: 'asc' },
      });
      if (users.length > 1) {
        throw new ConflictException(
          'Este e-mail existe em mais de uma filial. Selecione a oficina/filial para entrar.',
        );
      }
      return users[0] ?? null;
    }
    if (opts.tenantSlug) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug: opts.tenantSlug },
        select: { id: true },
      });
      if (!tenant) return null;
      return this.prisma.user.findUnique({
        where: { tenantId_email: { tenantId: tenant.id, email } },
        include,
      });
    }
    return null;
  }

  async login(
    opts: { tenantSlug?: string | null; accountId?: string | null; platform?: boolean },
    email: string,
    password: string,
    meta: RequestMeta,
  ): Promise<IssuedSession> {
    const user = await this.findLoginUser(opts, email);
    const tenantActive = user?.tenant.active ?? false;
    const ok = user ? await this.passwords.verify(user.passwordHash, password) : false;

    await this.prisma.loginAttempt.create({
      data: {
        tenantId: user?.tenantId ?? null,
        email,
        success: ok && !!user?.active && tenantActive,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      },
    });

    if (!user || !tenantActive || !ok) {
      throw new UnauthorizedException('Credenciais inválidas');
    }
    if (!user.active) {
      throw new ForbiddenException('Usuário inativo. Procure o administrador.');
    }
    // Separação de papéis:
    // - No apex da plataforma só entra o super admin.
    // - Num subdomínio de oficina o super admin NÃO entra (ele só gere a plataforma).
    if (opts.platform && !user.superAdmin) {
      throw new ForbiddenException('Área exclusiva da plataforma.');
    }
    if (!opts.platform && opts.accountId && user.superAdmin) {
      throw new ForbiddenException('O super usuário acessa apenas a plataforma.');
    }
    // Conta suspensa/pendente bloqueia o login (super usuário da plataforma é exceção).
    if (!user.superAdmin && user.tenant.account.status !== 'ACTIVE') {
      throw new ForbiddenException('Conta indisponível. Procure o suporte.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const refresh = await this.createRefreshToken(user.id, meta, user.sessionVersion);
    const accessToken = this.issueAccessToken(user, refresh.id, user.sessionVersion);

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

  async refresh(rawToken: string, meta: RequestMeta): Promise<IssuedSession> {
    if (!rawToken) throw new UnauthorizedException('Sessão expirada');

    const invalid = new UnauthorizedException('Sessão inválida ou expirada');
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(rawToken) },
      include: { user: { include: { tenant: true } } },
    });

    if (!stored) throw invalid;

    // Reuse de um token JÁ revogado (rotacionado/deslogado): forte sinal de
    // roubo. Revoga toda a família de refresh do usuário (logout global) e nega.
    if (stored.revokedAt) {
      await this.prisma.$transaction([
        this.prisma.refreshToken.updateMany({
          where: { userId: stored.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
        this.prisma.user.update({
          where: { id: stored.userId },
          data: { sessionVersion: { increment: 1 } },
        }),
      ]);
      this.logger.warn(
        `Reuse de refresh token revogado (user ${stored.userId}); sessões invalidadas.`,
      );
      await this.audit.record({
        tenantId: stored.user.tenantId,
        userId: stored.userId,
        module: 'auth',
        action: 'refresh-reuse-detected',
        entity: 'RefreshToken',
        entityId: stored.id,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw invalid;
    }

    if (
      stored.expiresAt < new Date() ||
      !stored.user.active ||
      !stored.user.tenant.active ||
      stored.sessionVersion !== stored.user.sessionVersion
    ) {
      throw invalid;
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const refresh = await this.createRefreshToken(stored.user.id, meta, stored.user.sessionVersion);
    const accessToken = this.issueAccessToken(stored.user, refresh.id, stored.user.sessionVersion);

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

  async listSessions(userId: string, rawToken?: string): Promise<UserSessionDto[]> {
    const currentHash = rawToken ? this.hashToken(rawToken) : null;
    const rows = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        tokenHash: true,
        userAgent: true,
        ip: true,
        createdAt: true,
        expiresAt: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      ip: row.ip,
      userAgent: row.userAgent,
      current: currentHash === row.tokenHash,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    }));
  }

  async revokeOwnSession(userId: string, sessionId: string, rawToken?: string): Promise<boolean> {
    const currentHash = rawToken ? this.hashToken(rawToken) : null;
    const session = await this.prisma.refreshToken.findFirst({
      where: { id: sessionId, userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, tokenHash: true },
    });
    if (!session) return false;
    await this.prisma.refreshToken.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    return currentHash === session.tokenHash;
  }

  async logoutAll(userId: string, meta?: RequestMeta): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { tenantId: true },
    });
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { sessionVersion: { increment: 1 } },
      }),
    ]);
    if (user) {
      await this.audit.record({
        tenantId: user.tenantId,
        userId,
        action: 'LOGOUT_ALL',
        module: 'auth',
        entity: 'User',
        entityId: userId,
        ip: meta?.ip,
        userAgent: meta?.userAgent,
      });
    }
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
    opts: { accountId?: string | null; tenantSlug?: string | null },
    email: string,
    meta: RequestMeta,
    linkOrigin?: string | null,
  ): Promise<{ ok: true }> {
    const select = {
      id: true,
      tenantId: true,
      name: true,
      email: true,
      active: true,
      tenant: { select: { name: true, active: true } },
    } as const;
    // Resolve o usuário pelo host (conta) ou pelo slug informado (apex/dev) —
    // mesmo critério do login, para o fluxo seguir o subdomínio/domínio próprio.
    let user: {
      id: string;
      tenantId: string;
      name: string;
      email: string;
      active: boolean;
      tenant: { name: string; active: boolean };
    } | null = null;
    if (opts.accountId) {
      if (opts.tenantSlug) {
        const tenant = await this.prisma.tenant.findFirst({
          where: { slug: opts.tenantSlug, accountId: opts.accountId },
          select: { id: true },
        });
        user = tenant
          ? await this.prisma.user.findUnique({
              where: { tenantId_email: { tenantId: tenant.id, email } },
              select,
            })
          : null;
      } else {
        const users = await this.prisma.user.findMany({
          where: { email, tenant: { accountId: opts.accountId } },
          select,
          take: 2,
          orderBy: { createdAt: 'asc' },
        });
        user = users.length === 1 ? users[0] : null;
      }
    } else if (opts.tenantSlug) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug: opts.tenantSlug },
        select: { id: true },
      });
      user = tenant
        ? await this.prisma.user.findUnique({
            where: { tenantId_email: { tenantId: tenant.id, email } },
            select,
          })
        : null;
    }

    if (user?.active && user.tenant.active) {
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

      const resetBase = (linkOrigin || this.appUrl()).replace(/\/+$/, '');
      const resetUrl = `${resetBase}/redefinir-senha?token=${token}`;
      const text = [
        `Olá, ${user.name}.`,
        '',
        `Recebemos uma solicitação para redefinir sua senha na ${user.tenant.name}.`,
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

  /**
   * Gera um link de "definir senha" para um usuário recém-provisionado e envia o
   * e-mail de boas-vindas. Usado quando a plataforma aprova um pedido: o admin da
   * oficina recebe um link seguro (token de uso único) em vez de uma senha
   * temporária trafegada. Best-effort: falha de e-mail não derruba a aprovação.
   */
  async sendAccountWelcomeLink(input: {
    userId: string;
    email: string;
    name: string;
    accountName: string;
    slug: string;
  }): Promise<void> {
    // Invalida links pendentes e cria um novo (validade maior p/ o 1º acesso: 48h).
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: input.userId, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    const token = randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: input.userId,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      },
    });

    const base = this.accountWebOrigin(input.slug);
    const link = `${base}/redefinir-senha?token=${token}`;
    const text = [
      `Olá, ${input.name}.`,
      '',
      `A sua oficina "${input.accountName}" foi liberada na plataforma Oficina!`,
      'Para o primeiro acesso, defina a sua senha pelo link abaixo (expira em 48 horas):',
      link,
      '',
      `Depois é só entrar em ${base}/login.`,
    ].join('\n');

    const mailResult = await this.mail.send({
      to: input.email,
      subject: 'Sua oficina foi liberada — defina a sua senha',
      text,
      html: text.replace(/\n/g, '<br />'),
    });

    if (mailResult.skipped) {
      this.logger.warn(
        `SMTP não configurado. Link de definição de senha para ${input.email}: ${link}`,
      );
    }
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
          sessionVersion: { increment: 1 },
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
          sessionVersion: { increment: 1 },
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
