import { z } from 'zod';

/** Schema de validação das variáveis de ambiente. Validado no boot. */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  APP_NAME: z.string().default('Oficina'),

  DATABASE_URL: z.string().url(),

  API_PORT: z.coerce.number().int().default(3333),
  API_GLOBAL_PREFIX: z.string().default('api'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),

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

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./uploads'),

  VAPID_PUBLIC_KEY: z.string().optional().default(''),
  VAPID_PRIVATE_KEY: z.string().optional().default(''),
  VAPID_SUBJECT: z.string().default('mailto:admin@oficina.local'),
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
