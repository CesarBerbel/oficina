import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@oficina/shared';

export const PERMISSIONS_KEY = 'requiredPermissions';

/** Exige uma ou mais permissões (formato `modulo:acao`) para acessar a rota. */
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
