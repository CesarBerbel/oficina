/**
 * Perfis de usuário interno do sistema.
 * O Cliente NÃO é um User — acessa via token público, sem login.
 */
export const UserRole = {
  ADMIN: 'ADMIN',
  ATENDENTE: 'ATENDENTE',
  TECNICO: 'TECNICO',
  ESTOQUISTA: 'ESTOQUISTA',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const USER_ROLES = Object.values(UserRole) as UserRole[];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  ATENDENTE: 'Atendente',
  TECNICO: 'Mecânico/Técnico',
  ESTOQUISTA: 'Estoquista/Compras',
};
