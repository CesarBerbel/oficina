import { z } from 'zod';
import { USER_ROLES } from '../enums/role.js';
import { paginationQuerySchema } from './common.js';

export const loginSchema = z.object({
  tenantSlug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, 'Informe a oficina')
    .max(80, 'Identificador da oficina muito longo')
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Use apenas letras minúsculas, números e hífens',
    ),
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  password: z.string().min(1, 'Informe a senha'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Nome muito curto').max(120),
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  password: z
    .string()
    .min(8, 'Mínimo de 8 caracteres')
    .max(72, 'Máximo de 72 caracteres'),
  role: z.enum(USER_ROLES as [string, ...string[]]),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = createUserSchema
  .partial()
  .extend({ active: z.boolean().optional() });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const listUsersQuerySchema = paginationQuerySchema.extend({
  role: z.enum(USER_ROLES as [string, ...string[]]).optional(),
  active: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => (typeof v === 'string' ? v === 'true' : v))
    .optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

/** Usuário retornado pela API (sem dados sensíveis). */
export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/** Sessão retornada ao frontend após login/refresh. */
export interface AuthUser {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}
