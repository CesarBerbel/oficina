import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { roleHasPermission, type Permission } from '@oficina/shared';
import { ALLOW_AUTHENTICATED_KEY } from '../decorators/allow-authenticated.decorator';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Guard global de RBAC. Toda rota deve declarar uma política explícita:
 * - @Public() para rotas públicas;
 * - @AllowAuthenticated() para qualquer usuário logado;
 * - @RequirePermission(...) para permissões granulares.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const user = context.switchToHttp().getRequest().user as AuthenticatedUser;
    if (!user) throw new ForbiddenException('Acesso negado');

    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && required.length > 0) {
      const allowed = required.every((p) => roleHasPermission(user.role, p));
      if (!allowed) {
        throw new ForbiddenException('Você não tem permissão para esta ação');
      }
      return true;
    }

    const allowAuthenticated = this.reflector.getAllAndOverride<boolean>(ALLOW_AUTHENTICATED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowAuthenticated) return true;

    throw new ForbiddenException('Rota autenticada sem política de permissão explícita');
  }
}
