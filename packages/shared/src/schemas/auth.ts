import { z } from 'zod';
import { USER_ROLES } from '../enums/role.js';
import { paginationQuerySchema } from './common.js';

export const loginSchema = z.object({
  // Opcional: em subdomínio próprio (cliente.saecbpa.com) a conta vem do host.
  // No apex/dev, é obrigatório informar a oficina.
  tenantSlug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, 'Informe a oficina')
    .max(80, 'Identificador da oficina muito longo')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use apenas letras minúsculas, números e hífens')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  password: z.string().min(1, 'Informe a senha'),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** Contexto de login resolvido pelo host (qual conta o subdomínio representa). */
export interface LoginContextDto {
  /** Conta dona do host (subdomínio/domínio próprio), ou null no apex/dev. */
  account: {
    name: string;
    slug: string;
    /** Oficinas/filiais da conta. Quando há mais de uma, o login deve escolher uma. */
    branches: { name: string; slug: string }[];
  } | null;
  /** Slug da filial resolvida pelo host quando o domínio aponta para uma oficina específica. */
  tenantSlug: string | null;
  /** true no apex da plataforma (login do super admin). */
  platform: boolean;
  /**
   * Subdomínio livre da plataforma (sem oficina vinculada): slug sugerido para o
   * cadastro de uma nova oficina. null quando não se aplica.
   */
  suggestedSlug: string | null;
  /**
   * true quando já existe um pedido de criação de conta pendente para o slug
   * sugerido — a tela deve mostrar "aguardando aprovação" em vez do cadastro.
   */
  pendingRequest: boolean;
}

const optionalInstallText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal('').transform(() => undefined));

/**
 * Instalação do sistema: cria a oficina matriz (dados completos + site) e o
 * super usuário. Só é permitida com o sistema vazio.
 */
export const installSystemSchema = z.object({
  // Oficina matriz
  shopName: z.string().trim().min(2, 'Informe o nome da oficina').max(160),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, 'Informe o identificador da oficina')
    .max(80, 'Identificador muito longo')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use apenas letras minúsculas, números e hífens'),
  cnpj: optionalInstallText(20),
  // Dados do site / contato
  tagline: optionalInstallText(200),
  phone: optionalInstallText(40),
  whatsapp: optionalInstallText(40),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('E-mail inválido')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  addressZip: optionalInstallText(12),
  addressStreet: optionalInstallText(160),
  addressNumber: optionalInstallText(20),
  addressComplement: optionalInstallText(120),
  addressDistrict: optionalInstallText(80),
  addressCity: optionalInstallText(80),
  addressState: optionalInstallText(2),
  // Super usuário (administrador da plataforma)
  adminName: z.string().trim().min(2, 'Informe seu nome').max(120),
  adminEmail: z.string().trim().toLowerCase().email('E-mail inválido'),
  password: z.string().min(8, 'Mínimo de 8 caracteres').max(72, 'Máximo de 72 caracteres'),
});

export type InstallSystemInput = z.infer<typeof installSystemSchema>;

export const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Nome muito curto').max(120),
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  password: z.string().min(8, 'Mínimo de 8 caracteres').max(72, 'Máximo de 72 caracteres'),
  role: z.enum(USER_ROLES as [string, ...string[]]),
  forcePasswordChange: z.boolean().optional().default(true),
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

export const forgotPasswordSchema = z.object({
  // Opcional: em subdomínio/domínio próprio a conta vem do host; no apex/dev é exigido.
  tenantSlug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, 'Informe a oficina')
    .max(80, 'Identificador da oficina muito longo')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use apenas letras minúsculas, números e hífens')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(32, 'Token inválido'),
  password: z.string().min(8, 'Mínimo de 8 caracteres').max(72, 'Máximo de 72 caracteres'),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual').optional(),
    password: z.string().min(8, 'Mínimo de 8 caracteres').max(72, 'Máximo de 72 caracteres'),
    confirmPassword: z.string().min(1, 'Confirme a nova senha'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas não conferem',
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

/** Usuário retornado pela API (sem dados sensíveis). */
export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  lastLoginAt: string | null;
  forcePasswordChange: boolean;
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
  forcePasswordChange: boolean;
  /** Administrador da plataforma (gestão de oficinas). */
  platformAdmin: boolean;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface UserSessionDto {
  id: string;
  ip: string | null;
  userAgent: string | null;
  current: boolean;
  createdAt: string;
  expiresAt: string;
}
