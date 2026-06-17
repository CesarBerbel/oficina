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
    if (!payload?.sub || !payload?.tenantId) {
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
        tenant: { select: { parentId: true } },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Sessão inválida');
    }

    // Grupo = matriz. Para a matriz, parentId é null → grupo é o próprio tenant.
    return {
      id: user.id,
      tenantId: user.tenantId,
      groupId: user.tenant.parentId ?? user.tenantId,
      role: user.role,
      email: user.email,
      superAdmin: user.superAdmin,
    };
  }
}
