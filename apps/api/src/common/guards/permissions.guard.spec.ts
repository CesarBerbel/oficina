import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission } from '@oficina/shared';
import { PermissionsGuard } from './permissions.guard';

function contextWith(role?: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  function guardWith(opts: {
    perms?: Permission[];
    isPublic?: boolean;
    allowAuthenticated?: boolean;
  }) {
    const reflector = {
      getAllAndOverride: (key: string) => {
        if (key === 'isPublic') return opts.isPublic ?? false;
        if (key === 'requiredPermissions') return opts.perms;
        if (key === 'allowAuthenticated') return opts.allowAuthenticated ?? false;
        return undefined;
      },
    } as unknown as Reflector;
    return new PermissionsGuard(reflector);
  }

  it('libera ADMIN para permissão restrita', () => {
    const guard = guardWith({ perms: [Permission.USERS_WRITE] });
    expect(guard.canActivate(contextWith('ADMIN'))).toBe(true);
  });

  it('bloqueia ATENDENTE sem a permissão', () => {
    const guard = guardWith({ perms: [Permission.USERS_READ] });
    expect(() => guard.canActivate(contextWith('ATENDENTE'))).toThrow(ForbiddenException);
  });

  it('libera rota pública sem checar usuário', () => {
    const guard = guardWith({ perms: [Permission.USERS_WRITE], isPublic: true });
    expect(guard.canActivate(contextWith())).toBe(true);
  });

  it('libera rota marcada para qualquer autenticado', () => {
    const guard = guardWith({ allowAuthenticated: true });
    expect(guard.canActivate(contextWith('TECNICO'))).toBe(true);
  });

  it('bloqueia rota autenticada sem política explícita', () => {
    const guard = guardWith({});
    expect(() => guard.canActivate(contextWith('ADMIN'))).toThrow(ForbiddenException);
  });
});
