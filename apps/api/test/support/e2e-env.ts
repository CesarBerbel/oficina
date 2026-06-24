const DEFAULT_TEST_ENV = {
  NODE_ENV: 'test',
  APP_NAME: 'Oficina E2E',
  API_GLOBAL_PREFIX: 'api',
  WEB_ORIGIN: 'http://localhost:3000',
  JWT_ACCESS_SECRET: 'oficina-e2e-access-secret-with-more-than-16-chars',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_SECRET: 'oficina-e2e-refresh-secret-with-more-than-16-chars',
  JWT_REFRESH_TTL: '7d',
  AUTH_COOKIE_NAME: 'oficina_e2e_rt',
  AUTH_COOKIE_SECURE: 'false',
  ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  RATE_LIMIT_TTL: '60',
  RATE_LIMIT_MAX: '1000',
  // Login tem throttle próprio (default 5/min); relaxa nos e2e, que disparam
  // vários logins por arquivo no mesmo app (throttler em memória não reseta).
  AUTH_LOGIN_RATE_LIMIT: '1000',
  // Determinismo: o ConfigModule carrega o .env da raiz (que pode ter flags de
  // produção, ex.: TENANT_DOMAIN_REQUIRE_VERIFIED=true) e ele vazaria para os
  // testes. Pinamos aqui (process.env já setado vence o dotenv) para que a
  // resolução por domínio próprio não exija verificação nos e2e.
  TENANT_DOMAIN_REQUIRE_VERIFIED: 'false',
  STORAGE_DRIVER: 'local',
  STORAGE_LOCAL_DIR: '/tmp/oficina-e2e-uploads',
  MAIL_DRIVER: 'log',
  SMTP_HOST: '',
  SMTP_PORT: '465',
  SMTP_SECURE: 'true',
  SMTP_USER: '',
  SMTP_PASS: '',
  SMTP_FROM: '',
  VAPID_PUBLIC_KEY: '',
  VAPID_PRIVATE_KEY: '',
  VAPID_SUBJECT: 'mailto:e2e@oficina.local',
} as const;

export function ensureE2eEnv(): void {
  for (const [key, value] of Object.entries(DEFAULT_TEST_ENV)) {
    process.env[key] ??= value;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL é obrigatório para os testes E2E. Use um banco descartável, por exemplo: postgresql://oficina:oficina_test_pwd@localhost:5434/oficina_test?schema=public',
    );
  }

  const databaseUrl = process.env.DATABASE_URL.toLowerCase();
  const looksLikeTestDatabase =
    databaseUrl.includes('oficina_test') ||
    databaseUrl.includes('_test') ||
    databaseUrl.includes('test_');

  if (!looksLikeTestDatabase) {
    throw new Error(
      `DATABASE_URL parece apontar para um banco não descartável: ${process.env.DATABASE_URL}. Os testes E2E truncam tabelas; use um banco de teste.`,
    );
  }
}
