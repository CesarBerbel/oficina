import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TenantDomainsService } from '../src/modules/tenant-domains/tenant-domains.service';
import { createE2eApp } from './support/e2e-app';
import { prisma, resetAndSeed, type SeedData, TEST_PASSWORD } from './support/e2e-db';
import { authHeader, loginAs } from './support/e2e-http';

describe('SaaS: domínios customizados, CORS dinâmico e quotas (e2e)', () => {
  let app: INestApplication;
  let seed: SeedData;

  beforeAll(async () => {
    process.env.WEB_ORIGINS = 'https://app.e2e.local,https://admin.e2e.local';
    app = await createE2eApp();
  });

  beforeEach(async () => {
    seed = await resetAndSeed();
  });

  afterAll(async () => {
    delete process.env.WEB_ORIGINS;
    await app?.close();
  });

  async function makeSuperAdmin() {
    await prisma.user.update({ where: { id: seed.tenant.admin.id }, data: { superAdmin: true } });
    return loginAs(app);
  }

  it('aceita CORS estático e domínio verificado; bloqueia domínio não verificado', async () => {
    const service = app.get(TenantDomainsService);
    expect(await service.isAllowedOrigin('https://app.e2e.local')).toBe(true);

    await prisma.tenantDomain.createMany({
      data: [
        {
          tenantId: seed.tenant.id,
          domain: 'cors-ok-e2e.com.br',
          verificationToken: 'cors-ok',
          verifiedAt: new Date(),
          status: 'VERIFIED',
          isPrimary: true,
        },
        {
          tenantId: seed.tenant.id,
          domain: 'cors-pending-e2e.com.br',
          verificationToken: 'cors-pending',
          status: 'PENDING',
          isPrimary: false,
        },
      ],
    });

    expect(await service.isAllowedOrigin('https://cors-ok-e2e.com.br')).toBe(true);
    expect(await service.isAllowedOrigin('https://cors-pending-e2e.com.br')).toBe(false);
    expect(await service.isAllowedOrigin('https://evil-e2e.com.br')).toBe(false);
  });

  it('permite definir domínio verificado como principal e remove primário anterior', async () => {
    const admin = await loginAs(app);
    const first = await prisma.tenantDomain.create({
      data: {
        tenantId: seed.tenant.id,
        domain: 'primary-a-e2e.com.br',
        verificationToken: 'a',
        verifiedAt: new Date(),
        status: 'VERIFIED',
        isPrimary: true,
      },
    });
    const second = await prisma.tenantDomain.create({
      data: {
        tenantId: seed.tenant.id,
        domain: 'primary-b-e2e.com.br',
        verificationToken: 'b',
        verifiedAt: new Date(),
        status: 'VERIFIED',
        isPrimary: false,
      },
    });

    await request(app.getHttpServer())
      .post(`/api/tenant-domains/${second.id}/primary`)
      .set(authHeader(admin.token))
      .send({ isPrimary: true })
      .expect(201);

    const domains = await prisma.tenantDomain.findMany({
      where: { id: { in: [first.id, second.id] } },
      orderBy: { domain: 'asc' },
    });
    expect(domains.find((d) => d.id === first.id)?.isPrimary).toBe(false);
    expect(domains.find((d) => d.id === second.id)?.isPrimary).toBe(true);
  });

  it('aplica quota de domínios customizados do plano', async () => {
    const superAdmin = await makeSuperAdmin();
    const account = await prisma.account.findUniqueOrThrow({ where: { slug: seed.tenant.slug } });

    const plan = await request(app.getHttpServer())
      .post('/api/platform/plans')
      .set(authHeader(superAdmin.token))
      .send({
        code: 'domain-one-e2e',
        name: 'Domínio único E2E',
        limits: [{ feature: 'CUSTOM_DOMAINS', enabled: true, limit: 1 }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/platform/plans/accounts/${account.id}`)
      .set(authHeader(superAdmin.token))
      .send({ planId: plan.body.id, status: 'ACTIVE' })
      .expect(201);

    const admin = await loginAs(app);
    await request(app.getHttpServer())
      .post('/api/tenant-domains')
      .set(authHeader(admin.token))
      .send({ domain: 'quota-domain-a-e2e.com.br' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/tenant-domains')
      .set(authHeader(admin.token))
      .send({ domain: 'quota-domain-b-e2e.com.br' })
      .expect(402);
  });

  it('aplica quota de usuários ativos do plano', async () => {
    const superAdmin = await makeSuperAdmin();
    const account = await prisma.account.findUniqueOrThrow({ where: { slug: seed.tenant.slug } });

    const plan = await request(app.getHttpServer())
      .post('/api/platform/plans')
      .set(authHeader(superAdmin.token))
      .send({
        code: 'users-four-e2e',
        name: 'Quatro usuários E2E',
        limits: [{ feature: 'USERS', enabled: true, limit: 4 }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/platform/plans/accounts/${account.id}`)
      .set(authHeader(superAdmin.token))
      .send({ planId: plan.body.id, status: 'ACTIVE' })
      .expect(201);

    const admin = await loginAs(app);
    await request(app.getHttpServer())
      .post('/api/users')
      .set(authHeader(admin.token))
      .send({
        name: 'Usuário quota E2E',
        email: `quota-${Date.now()}@oficina.local`,
        role: 'ATENDENTE',
        password: TEST_PASSWORD,
      })
      .expect(402);

    const usage = await request(app.getHttpServer())
      .get('/api/billing/usage')
      .set(authHeader(admin.token))
      .expect(200);
    const users = usage.body.usage.find((row: { feature: string }) => row.feature === 'USERS');
    expect(users.used).toBe(4);
    expect(users.limit).toBe(4);
  });
});
