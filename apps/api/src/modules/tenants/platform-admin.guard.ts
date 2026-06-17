import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

/**
 * Libera o acesso apenas para o super usuário (acesso global a todas as oficinas).
 * Roda após o JwtAuthGuard global, então `req.user` já está preenchido.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();

    if (!req.user?.superAdmin) {
      throw new ForbiddenException('Acesso restrito ao super usuário da plataforma.');
    }
    return true;
  }
}
