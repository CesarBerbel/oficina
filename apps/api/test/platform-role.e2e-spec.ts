import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { createE2eApp } from './support/e2e-app';
import { prisma, resetAndSeed, TEST_PASSWORD } from './support/e2e-db';
import { authHeader } from './support/e2e-http';

const BASE = 'saecbpa.test'; // apex da plataforma
const OFICINA_HOST = 'modelo.saecbpa.test';
const SUPER_EMAIL = 'super@plataforma.test';

/**
 * Separação de papéis (Fase 1.5): o super admin só entra pelo apex da plataforma,
 * vê apenas a área de plataforma e NÃO entra em oficina nenhuma.
 */
describe('Papel da plataforma (super admin) (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.PLATFORM_BASE_DOMAIN = BASE;
    app = await createE2eApp();
  });

  beforeEach(async () => {
    await resetAndSeed();
    // Conta interna "plataforma" + super admin.
    const account = await prisma.account.create({
      data: { name: 'Plataforma', slug: 'plataforma', status: 'ACTIVE' },
    });
    const tenant = await prisma.tenant.create({
      data: { name: 'Plataforma', slug: 'plataforma', accountId: account.id },
    });
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        name: 'Super',
        email: SUPER_EMAIL,
        passwordHash: await argon2.hash(TEST_PASSWORD, { type: argon2.argon2id }),
        role: 'ADMIN',
        active: true,
        superAdmin: true,
      },
    });
    // Domínio da oficina-modelo (para tentar logar nela).
    const modelo = await prisma.tenant.findUniqueOrThrow({
      where: { slug: 'oficina-modelo' },
      select: { id: true },
    });
    await prisma.tenantDomain.create({
      data: {
        tenantId: modelo.id,
        domain: OFICINA_HOST,
        verificationToken: 'tk',
        verifiedAt: new Date(),
        status: 'VERIFIED',
        isPrimary: true,
      },
    });
  });

  afterAll(async () => {
    delete process.env.PLATFORM_BASE_DOMAIN;
    await app?.close();
  });

  it('/auth/context no apex indica plataforma', async () => {
    const ctx = await request(app.getHttpServer())
      .get('/api/auth/context')
      .set('X-Forwarded-Host', BASE)
      .expect(200);
    expect(ctx.body).toEqual({ account: null, platform: true, suggestedSlug: null });
  });

  it('super admin entra pelo apex (sem slug) e vê o overview da plataforma', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-Host', BASE)
      .send({ email: SUPER_EMAIL, password: TEST_PASSWORD })
      .expect(200);
    expect(login.body.user.platformAdmin).toBe(true);

    const overview = await request(app.getHttpServer())
      .get('/api/platform/accounts/overview')
      .set(authHeader(login.body.accessToken))
      .expect(200);
    expect(overview.body.accounts.active).toBeGreaterThanOrEqual(2); // modelo + concorrente
    expect(overview.body.oficinas).toBeGreaterThanOrEqual(2);
  });

  it('super admin NÃO entra num subdomínio de oficina', async () => {
    // Promove o admin da oficina-modelo a super admin e tenta logar na oficina dele.
    await prisma.user.updateMany({
      where: { email: 'admin@oficina.local' },
      data: { superAdmin: true },
    });
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-Host', OFICINA_HOST)
      .send({ email: 'admin@oficina.local', password: TEST_PASSWORD })
      .expect(403);
  });

  it('usuário comum não entra pelo apex da plataforma', async () => {
    // atendente da oficina-modelo não pertence à plataforma → recusado.
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-Host', BASE)
      .send({ email: 'atendente@oficina.local', password: TEST_PASSWORD })
      .expect(401);
  });

  it('subdomínio livre (sem oficina) sugere o slug para cadastro', async () => {
    const ctx = await request(app.getHttpServer())
      .get('/api/auth/context')
      .set('X-Forwarded-Host', 'novaoficina.saecbpa.test')
      .expect(200);
    expect(ctx.body).toEqual({ account: null, platform: false, suggestedSlug: 'novaoficina' });
  });

  it('a lista de oficinas da plataforma não inclui a conta interna', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-Host', BASE)
      .send({ email: SUPER_EMAIL, password: TEST_PASSWORD })
      .expect(200);
    const list = await request(app.getHttpServer())
      .get('/api/platform/tenants')
      .set(authHeader(login.body.accessToken))
      .expect(200);
    const slugs = (list.body as Array<{ slug: string }>).map((t) => t.slug);
    expect(slugs).not.toContain('plataforma');
    expect(slugs).toContain('oficina-modelo');
  });

  it('a lista de contas não inclui a conta interna plataforma', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-Host', BASE)
      .send({ email: SUPER_EMAIL, password: TEST_PASSWORD })
      .expect(200);
    const list = await request(app.getHttpServer())
      .get('/api/platform/accounts')
      .set(authHeader(login.body.accessToken))
      .expect(200);
    const slugs = (list.body as Array<{ slug: string }>).map((a) => a.slug);
    expect(slugs).not.toContain('plataforma');
    expect(slugs).toContain('oficina-modelo');
  });
});
