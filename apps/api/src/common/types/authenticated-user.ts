import type { Role } from '@prisma/client';

/** Payload do access token (JWT). */
export interface JwtPayload {
  sub: string; // userId
  tenantId: string;
  role: Role;
  email: string;
  /** Session id: id do refresh token que originou este access token. */
  sid: string;
  /** Versão global de sessão do usuário no momento da emissão. */
  sv: number;
}

/** Usuário anexado em `req.user` após autenticação. */
export interface AuthenticatedUser {
  id: string;
  /** Oficina (matriz ou filial) do usuário. Escopo dos dados operacionais. */
  tenantId: string;
  /**
   * Grupo do usuário (matriz). Para a matriz, é igual ao tenantId; para filiais,
   * é o id da matriz. Escopo dos dados compartilhados (catálogo, clientes).
   */
  groupId: string;
  /** Conta (cliente do SaaS) dona da oficina. Âncora do isolamento por conta. */
  accountId: string;
  role: Role;
  email: string;
  superAdmin: boolean;
  /** Session id do access token validado. */
  sessionId?: string;
}
