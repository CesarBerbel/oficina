import { UserRole } from '../enums/role.js';

/**
 * Permissões granulares no formato `modulo:acao`.
 * Os guards do backend (PermissionsGuard) e os menus do frontend leem daqui.
 */
export const Permission = {
  // Usuários / acesso
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  ROLES_MANAGE: 'roles:manage',
  AUDIT_READ: 'audit:read',

  // Clientes / veículos
  CUSTOMERS_READ: 'customers:read',
  CUSTOMERS_WRITE: 'customers:write',
  VEHICLES_READ: 'vehicles:read',
  VEHICLES_WRITE: 'vehicles:write',
  CHECKINS_WRITE: 'checkins:write',

  // OS
  OS_READ: 'os:read',
  OS_WRITE: 'os:write',
  OS_STATUS: 'os:status',
  OS_DIAGNOSE: 'os:diagnose',
  OS_DELETE: 'os:delete',

  // Catálogo
  SERVICES_READ: 'services:read',
  SERVICES_WRITE: 'services:write',
  COMBOS_WRITE: 'combos:write',

  // Estoque / compras
  INVENTORY_READ: 'inventory:read',
  INVENTORY_WRITE: 'inventory:write',
  STOCK_MOVE: 'stock:move',
  PURCHASES_READ: 'purchases:read',
  PURCHASES_WRITE: 'purchases:write',
  NFE_IMPORT: 'nfe:import',

  // Orçamento
  QUOTES_WRITE: 'quotes:write',

  // Comunicação / conteúdo
  MESSAGES_READ: 'messages:read',
  MESSAGES_WRITE: 'messages:write',
  SITE_MANAGE: 'site:manage',
  BLOG_WRITE: 'blog:write',

  // Configurações / IA
  SETTINGS_MANAGE: 'settings:manage',
  AI_MANAGE: 'ai:manage',

  // Dashboard
  DASHBOARD_READ: 'dashboard:read',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS = Object.values(Permission) as Permission[];

/**
 * Matriz perfil → permissões. ADMIN recebe tudo.
 * Esta é a fonte de verdade do RBAC (espelhada no seed/DB).
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: ALL_PERMISSIONS,

  ATENDENTE: [
    Permission.DASHBOARD_READ,
    Permission.CUSTOMERS_READ,
    Permission.CUSTOMERS_WRITE,
    Permission.VEHICLES_READ,
    Permission.VEHICLES_WRITE,
    Permission.CHECKINS_WRITE,
    Permission.OS_READ,
    Permission.OS_WRITE,
    Permission.OS_STATUS,
    Permission.QUOTES_WRITE,
    Permission.SERVICES_READ,
    Permission.INVENTORY_READ,
    Permission.PURCHASES_READ,
    Permission.MESSAGES_READ,
    Permission.MESSAGES_WRITE,
  ],

  TECNICO: [
    Permission.DASHBOARD_READ,
    Permission.CUSTOMERS_READ,
    Permission.VEHICLES_READ,
    Permission.OS_READ,
    Permission.OS_DIAGNOSE,
    Permission.OS_STATUS,
    Permission.SERVICES_READ,
    Permission.INVENTORY_READ,
  ],

  ESTOQUISTA: [
    Permission.DASHBOARD_READ,
    Permission.CUSTOMERS_READ,
    Permission.VEHICLES_READ,
    Permission.OS_READ,
    Permission.INVENTORY_READ,
    Permission.INVENTORY_WRITE,
    Permission.STOCK_MOVE,
    Permission.PURCHASES_READ,
    Permission.PURCHASES_WRITE,
    Permission.NFE_IMPORT,
    Permission.SERVICES_READ,
  ],
};

export function permissionsForRole(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function roleHasPermission(
  role: UserRole,
  permission: Permission,
): boolean {
  return permissionsForRole(role).includes(permission);
}
