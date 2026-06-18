import { validateEnv } from './env';

const STRONG_A = 'k7Qm2Zr9Tn4Wp8Lx1Vy6Bd3Hf5Jc0Ng2Sa7Ue9Oi'; // 41 chars, sem placeholders
const STRONG_B = 'Zx9Wc2Vb5Nm8Lk1Jh4Gf7Ds0Aq3Po6Iu9Yt2Re5Wq'; // distinto de A
const STRONG_C = 'Qw3Er7Ty1Ui5Op9As2Df6Gh0Jk4Lz8Xc1Vb5Nm7Mp'; // garage, distinto de A/B
const HEX_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function prodEnv(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db?schema=public',
    JWT_ACCESS_SECRET: STRONG_A,
    JWT_REFRESH_SECRET: STRONG_B,
    GARAGE_JWT_SECRET: STRONG_C,
    ENCRYPTION_KEY: HEX_KEY,
    AUTH_COOKIE_SECURE: 'true',
    MAIL_DRIVER: 'log',
    ...overrides,
  };
}

describe('validateEnv (regras de produção)', () => {
  it('aceita uma configuração de produção válida', () => {
    expect(() => validateEnv(prodEnv())).not.toThrow();
  });

  it('em dev, mantém regras brandas (segredos curtos/placeholder passam)', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://u:p@localhost:5432/db?schema=public',
        JWT_ACCESS_SECRET: 'dev-change-me-access',
        JWT_REFRESH_SECRET: 'dev-change-me-refresh',
        ENCRYPTION_KEY: HEX_KEY,
      }),
    ).not.toThrow();
  });

  it('rejeita segredos JWT iguais em produção', () => {
    expect(() => validateEnv(prodEnv({ JWT_REFRESH_SECRET: STRONG_A }))).toThrow(
      /JWT_REFRESH_SECRET/,
    );
  });

  it('rejeita segredo placeholder em produção', () => {
    expect(() =>
      validateEnv(prodEnv({ JWT_ACCESS_SECRET: 'change-me-please-change-me-please-1234' })),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejeita ENCRYPTION_KEY só de zeros em produção', () => {
    expect(() => validateEnv(prodEnv({ ENCRYPTION_KEY: '0'.repeat(64) }))).toThrow(
      /ENCRYPTION_KEY/,
    );
  });

  it('exige AUTH_COOKIE_SECURE=true em produção', () => {
    expect(() => validateEnv(prodEnv({ AUTH_COOKIE_SECURE: 'false' }))).toThrow(
      /AUTH_COOKIE_SECURE/,
    );
  });

  it('bloqueia SMTP incompleto quando MAIL_DRIVER=smtp em produção', () => {
    expect(() => validateEnv(prodEnv({ MAIL_DRIVER: 'smtp' }))).toThrow(/SMTP_/);
    expect(() =>
      validateEnv(
        prodEnv({
          MAIL_DRIVER: 'smtp',
          SMTP_HOST: 'smtp.example.com',
          SMTP_USER: 'u@example.com',
          SMTP_PASS: 'secret',
        }),
      ),
    ).not.toThrow();
  });

  it('exige GARAGE_JWT_SECRET em produção', () => {
    expect(() => validateEnv(prodEnv({ GARAGE_JWT_SECRET: '' }))).toThrow(/GARAGE_JWT_SECRET/);
  });

  it('rejeita GARAGE_JWT_SECRET fraco em produção', () => {
    expect(() => validateEnv(prodEnv({ GARAGE_JWT_SECRET: 'curto' }))).toThrow(/GARAGE_JWT_SECRET/);
  });

  it('rejeita GARAGE_JWT_SECRET igual a um segredo JWT', () => {
    expect(() => validateEnv(prodEnv({ GARAGE_JWT_SECRET: STRONG_A }))).toThrow(
      /GARAGE_JWT_SECRET/,
    );
  });

  it('rejeita STORAGE_DRIVER inexistente (s3)', () => {
    expect(() => validateEnv(prodEnv({ STORAGE_DRIVER: 's3' }))).toThrow(/STORAGE_DRIVER/);
  });
});
