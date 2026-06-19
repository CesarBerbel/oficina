import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedUser, JwtPayload } from '../../common/types/authenticated-user';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload?.sub || !payload?.tenantId || !payload?.sid || typeof payload.sv !== 'number') {
      throw new UnauthorizedException('Token inválido');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        tenantId: payload.tenantId,
        active: true,
        tenant: { active: true },
      },
      select: {
        id: true,
        tenantId: true,
        role: true,
        email: true,
        superAdmin: true,
        sessionVersion: true,
        tenant: {
          select: { parentId: true, accountId: true, account: { select: { status: true } } },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Sessão inválida');
    }

    if (user.sessionVersion !== payload.sv) {
      throw new UnauthorizedException('Sessão revogada');
    }

    const session = await this.prisma.refreshToken.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        sessionVersion: payload.sv,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });

    if (!session) {
      throw new UnauthorizedException('Sessão revogada');
    }

    // Conta suspensa/pendente não acessa (super usuário da plataforma é exceção).
    if (!user.superAdmin && user.tenant.account.status !== 'ACTIVE') {
      throw new UnauthorizedException('Conta indisponível');
    }

    // Grupo = matriz. Para a matriz, parentId é null → grupo é o próprio tenant.
    return {
      id: user.id,
      tenantId: user.tenantId,
      groupId: user.tenant.parentId ?? user.tenantId,
      accountId: user.tenant.accountId,
      role: user.role,
      email: user.email,
      superAdmin: user.superAdmin,
      sessionId: payload.sid,
    };
  }
}
