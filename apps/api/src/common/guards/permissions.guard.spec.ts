import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission } from '@oficina/shared';
import { PermissionsGuard } from './permissions.guard';

function contextWith(role: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  function guardRequiring(perms: Permission[], isPublic = false) {
    const reflector = {
      getAllAndOverride: (key: string) =>
        key === 'isPublic' ? isPublic : perms,
    } as unknown as Reflector;
    return new PermissionsGuard(reflector);
  }

  it('libera ADMIN para permissão restrita', () => {
    const guard = guardRequiring([Permission.USERS_WRITE]);
    expect(guard.canActivate(contextWith('ADMIN'))).toBe(true);
  });

  it('bloqueia ATENDENTE sem a permissão', () => {
    const guard = guardRequiring([Permission.USERS_READ]);
    expect(() => guard.canActivate(contextWith('ATENDENTE'))).toThrow(
      ForbiddenException,
    );
  });

  it('libera rota pública sem checar permissão', () => {
    const guard = guardRequiring([Permission.USERS_WRITE], true);
    expect(guard.canActivate(contextWith('TECNICO'))).toBe(true);
  });
});
