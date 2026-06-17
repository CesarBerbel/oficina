import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

/**
 * Libera o acesso apenas para administradores da plataforma — e-mails listados
 * em PLATFORM_ADMIN_EMAILS (separados por vírgula). Roda após o JwtAuthGuard
 * global, então `req.user` já está preenchido.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const email = req.user?.email?.trim().toLowerCase();
    const list = (this.config.get<string>('PLATFORM_ADMIN_EMAILS') ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (!email || list.length === 0 || !list.includes(email)) {
      throw new ForbiddenException(
        'Acesso restrito ao administrador da plataforma',
      );
    }
    return true;
  }
}
