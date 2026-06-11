import type { Role } from '@prisma/client';

/** Payload do access token (JWT). */
export interface JwtPayload {
  sub: string; // userId
  tenantId: string;
  role: Role;
  email: string;
}

/** Usuário anexado em `req.user` após autenticação. */
export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  role: Role;
  email: string;
}
