import { z } from 'zod';

/** Subdomínios reservados — não podem virar slug de conta. */
export const RESERVED_SUBDOMAINS = [
  'www',
  'app',
  'api',
  'admin',
  'painel',
  'plataforma',
  'mail',
  'smtp',
  'imap',
  'pop',
  'ftp',
  'ns',
  'ns1',
  'ns2',
  'dns',
  'static',
  'assets',
  'cdn',
  'status',
  'health',
  'help',
  'support',
  'suporte',
  'blog',
  'docs',
  'dev',
  'staging',
  'test',
] as const;

/** Identificador (subdomínio) de uma conta: formato válido e não reservado. */
export const accountSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'Informe o identificador (subdomínio)')
  .max(63, 'Identificador muito longo')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use apenas letras minúsculas, números e hífens')
  .refine(
    (s) => !(RESERVED_SUBDOMAINS as readonly string[]).includes(s),
    'Este subdomínio é reservado. Escolha outro.',
  );

/** Provisionamento de uma conta (cliente do SaaS) pelo admin da plataforma. */
export const provisionAccountSchema = z.object({
  /** Nome da conta/oficina principal. */
  name: z.string().trim().min(2, 'Informe o nome da oficina').max(160),
  /** Identificador único = subdomínio (ex.: "cliente" → cliente.seudominio.com). */
  slug: accountSlugSchema,
  cnpj: z
    .string()
    .trim()
    .max(20)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  adminName: z.string().trim().min(2, 'Informe o nome do administrador').max(120),
  adminEmail: z.string().trim().toLowerCase().email('E-mail inválido'),
});
export type ProvisionAccountInput = z.infer<typeof provisionAccountSchema>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal('').transform(() => undefined));

/** Pedido público de criação de conta (vindo da landing). */
export const createAccountRequestSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da oficina').max(160),
  slug: accountSlugSchema,
  contactName: z.string().trim().min(2, 'Informe seu nome').max(120),
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  phone: optionalText(40),
  message: optionalText(1000),
});
export type CreateAccountRequestInput = z.infer<typeof createAccountRequestSchema>;

/** Visão geral da plataforma (dashboard do super admin). */
export interface PlatformOverviewDto {
  accounts: { total: number; active: number; suspended: number; pending: number };
  /** Pedidos de conta aguardando aprovação. */
  pendingRequests: number;
  /** Total de oficinas (tenants) das contas-cliente (exclui a conta da plataforma). */
  oficinas: number;
}

/** Conta (cliente do SaaS) na visão do platform admin. */
export interface AccountDto {
  id: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
  /** Quantidade de oficinas (matriz + filiais) da conta. */
  oficinasCount: number;
  createdAt: string;
}

/** Ativar/suspender uma conta. */
export const updateAccountStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});
export type UpdateAccountStatusInput = z.infer<typeof updateAccountStatusSchema>;

/** Pedido de conta na visão do platform admin (Fase 1, PR 5). */
export interface AccountRequestDto {
  id: string;
  name: string;
  slug: string;
  contactName: string;
  email: string;
  phone: string | null;
  message: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}

/** Resultado do provisionamento (a senha temporária aparece UMA vez). */
export interface ProvisionedAccountDto {
  account: { id: string; name: string; slug: string; status: string };
  tenant: { id: string; slug: string };
  admin: { name: string; email: string };
  /** Senha temporária gerada para o admin da conta (troca obrigatória no 1º login). */
  tempPassword: string;
  /** Domínio criado (quando PLATFORM_BASE_DOMAIN está configurado); senão null. */
  domain: string | null;
  /** URL de acesso da conta (quando há domínio). */
  loginUrl: string | null;
}
