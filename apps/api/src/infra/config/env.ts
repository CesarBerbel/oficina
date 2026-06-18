import { z } from 'zod';

/** Schema base das variáveis de ambiente. O `envSchema` (abaixo) adiciona as
 * regras de produção. Validado no boot. */
const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().default('Oficina'),
  APP_VERSION: z.string().default('0.1.0'),

  DATABASE_URL: z.string().url(),

  API_PORT: z.coerce.number().int().default(3333),
  API_GLOBAL_PREFIX: z.string().default('api'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  /** Base pública confiável para montar URLs absolutas (ex.: uploads). Vazio = relativo. */
  APP_URL: z.string().url().or(z.literal('')).default(''),
  /** Exige TenantDomain verificado para resolver o site por domínio (sempre em prod). */
  TENANT_DOMAIN_REQUIRE_VERIFIED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** Ignora overrides de oficina (?tenantSlug=, x-public-*) — sempre ligado em prod. */
  PUBLIC_STRICT_HOST: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_REFRESH_TTL: z.string().default('7d'),
  /** Segredo dos tokens de sessão da garagem (cliente). Vazio = usa JWT_ACCESS_SECRET. */
  GARAGE_JWT_SECRET: z.string().optional().default(''),
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
  /** Timeout (ms) das chamadas à IA. */
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().default(30_000),

  // Apenas 'local' é implementado hoje. (S3/R2 fica para o futuro — não exponha
  // uma opção que não existe.)
  STORAGE_DRIVER: z.enum(['local']).default('local'),
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

  // ── Alertas ativos (monitor de métricas → notifica admins) ─────────────────
  /** Liga o monitor de alertas (in-app/push/e-mail). 'false' desliga. */
  ALERT_MONITOR_ENABLED: z.enum(['true', 'false']).default('true'),
  /** Intervalo entre varreduras do monitor de alertas (ms). */
  ALERT_SCAN_INTERVAL_MS: z.coerce.number().int().min(10_000).default(300_000),
  /** Cooldown antes de renotificar o mesmo alerta (horas). */
  ALERT_RENOTIFY_HOURS: z.coerce.number().int().min(1).default(24),
  /** Idade máxima do último backup antes de alertar (horas). */
  BACKUP_MAX_AGE_HOURS: z.coerce.number().int().min(1).default(26),
  /** Idade do pendente mais antigo do outbox antes de alertar (segundos). */
  OUTBOX_STUCK_AGE_SEC: z.coerce.number().int().min(30).default(600),
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
  // SMTP incompleto em produção: ou desligue (MAIL_DRIVER=log) ou configure tudo.
  if (env.MAIL_DRIVER === 'smtp') {
    for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'] as const) {
      if (!env[key]?.trim())
        fail(key, 'Obrigatório quando MAIL_DRIVER=smtp em produção (ou use MAIL_DRIVER=log).');
    }
  }
  // Segredo dedicado da garagem é obrigatório em produção (e precisa ser forte).
  if (!env.GARAGE_JWT_SECRET?.trim()) {
    fail('GARAGE_JWT_SECRET', 'Obrigatório em produção (segredo dedicado da garagem).');
  } else {
    if (env.GARAGE_JWT_SECRET.length < 32)
      fail('GARAGE_JWT_SECRET', 'Em produção precisa de ao menos 32 caracteres.');
    if (WEAK_SECRET.test(env.GARAGE_JWT_SECRET))
      fail('GARAGE_JWT_SECRET', 'Segredo de exemplo/placeholder não é permitido em produção.');
    if (
      env.GARAGE_JWT_SECRET === env.JWT_ACCESS_SECRET ||
      env.GARAGE_JWT_SECRET === env.JWT_REFRESH_SECRET
    )
      fail('GARAGE_JWT_SECRET', 'Deve ser diferente dos segredos JWT de acesso/refresh.');
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
