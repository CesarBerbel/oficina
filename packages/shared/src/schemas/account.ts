import { z } from 'zod';

/** Subdomínios reservados — não podem virar slug de conta. */
export const RESERVED_SUBDOMAINS = [
  'www',
  'app',
  'api',
  'admin',
  'painel',
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

const slugSchema = z
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
  slug: slugSchema,
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
