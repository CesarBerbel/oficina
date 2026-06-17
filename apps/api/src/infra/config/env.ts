import { z } from 'zod';

/** Schema base das variáveis de ambiente. O `envSchema` (abaixo) adiciona as
 * regras de produção. Validado no boot. */
const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().default('Oficina'),

  DATABASE_URL: z.string().url(),

  API_PORT: z.coerce.number().int().default(3333),
  API_GLOBAL_PREFIX: z.string().default('api'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  /** Base pública confiável para montar URLs absolutas (ex.: uploads). Vazio = relativo. */
  APP_URL: z.string().url().or(z.literal('')).default(''),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_REFRESH_TTL: z.string().default('7d'),
  AUTH_COOKIE_NAME: z.string().default('oficina_rt'),
  AUTH_COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY deve ter 64 chars hex (32 bytes)'),

  RATE_LIMIT_TTL: z.coerce.number().int().default(60),
  RATE_LIMIT_MAX: z.coerce.number().int().default(120),
  /** Tentativas de login por minuto (relaxado em CI/e2e). */
  AUTH_LOGIN_RATE_LIMIT: z.coerce.number().int().default(5),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./uploads'),

  VAPID_PUBLIC_KEY: z.string().optional().default(''),
  VAPID_PRIVATE_KEY: z.string().optional().default(''),
  VAPID_SUBJECT: z.string().default('mailto:admin@oficina.local'),

  // ─── E-mail ───
  // 'smtp' envia de verdade (requer SMTP_* abaixo); 'log' simula no terminal.
  MAIL_DRIVER: z.enum(['smtp', 'log']).default('smtp'),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().default(465),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  /** Remetente exibido. Cai para SMTP_USER quando vazio. */
  SMTP_FROM: z.string().optional().default(''),
});

/** Valores placeholder/de exemplo que jamais devem ir para produção. */
const WEAK_SECRET = /change|example|placeholder|secret-with|oficina-(ci|e2e|dev)/i;

/**
 * Em produção, exige segredos fortes e distintos e cookies seguros. Em
 * desenvolvimento/teste mantém as regras brandas (defaults/valores de exemplo).
 */
export const envSchema = baseEnvSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;

  const fail = (path: string, message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    const value = env[key];
    if (value.length < 32) fail(key, 'Em produção precisa de ao menos 32 caracteres.');
    if (WEAK_SECRET.test(value))
      fail(key, 'Segredo de exemplo/placeholder não é permitido em produção.');
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    fail('JWT_REFRESH_SECRET', 'Deve ser diferente de JWT_ACCESS_SECRET.');
  }
  if (/^0+$/.test(env.ENCRYPTION_KEY)) {
    fail('ENCRYPTION_KEY', 'Não use uma chave só de zeros em produção.');
  }
  if (!env.AUTH_COOKIE_SECURE) {
    fail('AUTH_COOKIE_SECURE', 'Deve ser "true" em produção (cookies sob HTTPS).');
  }
});

export type Env = z.infer<typeof envSchema>;

/** Usado pelo ConfigModule.validate. */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${issues}`);
  }
  return parsed.data;
}
