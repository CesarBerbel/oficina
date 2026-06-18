import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './support/e2e-app';
import { prisma, resetAndSeed, TENANT_SLUG } from './support/e2e-db';
import { authHeader, loginAs } from './support/e2e-http';

/**
 * Provisionamento de conta (Fase 1, PR 2): só o platform admin cria uma conta
 * nova (Account + oficina + admin com senha temporária + subdomínio verificado).
 */
describe('Provisionamento de conta (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.PLATFORM_BASE_DOMAIN = 'saecbpa.test';
    app = await createE2eApp();
  });

  beforeEach(async () => {
    await resetAndSeed();
  });

  afterAll(async () => {
    delete process.env.PLATFORM_BASE_DOMAIN;
    await app?.close();
  });

  /** Loga e promove o admin da matriz a super usuário da plataforma. */
  async function platformToken(): Promise<string> {
    await prisma.user.updateMany({
      where: { email: 'admin@oficina.local' },
      data: { superAdmin: true },
    });
    const admin = await loginAs(app);
    return admin.token;
  }

  it('platform admin provisiona conta; o novo admin loga com a senha temporária', async () => {
    const token = await platformToken();

    const res = await request(app.getHttpServer())
      .post('/api/platform/accounts')
      .set(authHeader(token))
      .send({ name: 'Oficina do João', slug: 'joao', adminName: 'João', adminEmail: 'joao@x.com' })
      .expect(201);

    expect(res.body.account.slug).toBe('joao');
    expect(res.body.domain).toBe('joao.saecbpa.test');
    expect(res.body.loginUrl).toBe('https://joao.saecbpa.test');
    expect(typeof res.body.tempPassword).toBe('string');
    expect(res.body.tempPassword.length).toBeGreaterThanOrEqual(8);

    // Conta + oficina + subdomínio verificado criados.
    const account = await prisma.account.findUnique({ where: { slug: 'joao' } });
    expect(account?.status).toBe('ACTIVE');
    const domain = await prisma.tenantDomain.findUnique({
      where: { domain: 'joao.saecbpa.test' },
    });
    expect(domain?.verifiedAt).not.toBeNull();

    // O novo admin loga com a senha temporária e precisa trocá-la.
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ tenantSlug: 'joao', email: 'joao@x.com', password: res.body.tempPassword })
      .expect(200);
    expect(login.body.user.forcePasswordChange).toBe(true);
  });

  it('rejeita subdomínio reservado (400)', async () => {
    const token = await platformToken();
    await request(app.getHttpServer())
      .post('/api/platform/accounts')
      .set(authHeader(token))
      .send({ name: 'Conta Teste', slug: 'app', adminName: 'Admin', adminEmail: 'a@x.com' })
      .expect(400);
  });

  it('rejeita slug já existente (409)', async () => {
    const token = await platformToken();
    await request(app.getHttpServer())
      .post('/api/platform/accounts')
      .set(authHeader(token))
      .send({ name: 'Conta Teste', slug: TENANT_SLUG, adminName: 'Admin', adminEmail: 'a@x.com' })
      .expect(409);
  });

  it('nega acesso a quem não é platform admin (403)', async () => {
    const admin = await loginAs(app); // sem promover → não é super admin
    await request(app.getHttpServer())
      .post('/api/platform/accounts')
      .set(authHeader(admin.token))
      .send({ name: 'Conta Teste', slug: 'outra', adminName: 'Admin', adminEmail: 'a@x.com' })
      .expect(403);
  });
});
