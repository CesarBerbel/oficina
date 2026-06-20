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

  async function assignPlanWithLimits(
    code: string,
    name: string,
    limits: Array<{ feature: string; enabled?: boolean; limit: number | null }>,
  ): Promise<void> {
    const superAdmin = await makeSuperAdmin();
    const account = await prisma.account.findUniqueOrThrow({ where: { slug: seed.tenant.slug } });

    const plan = await request(app.getHttpServer())
      .post('/api/platform/plans')
      .set(authHeader(superAdmin.token))
      .send({ code, name, limits })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/platform/plans/accounts/${account.id}`)
      .set(authHeader(superAdmin.token))
      .send({ planId: plan.body.id, status: 'ACTIVE' })
      .expect(201);
  }

  async function createCustomerAndVehicle(
    token: string,
    plate: string,
  ): Promise<{ customerId: string; vehicleId: string }> {
    const customer = await request(app.getHttpServer())
      .post('/api/customers')
      .set(authHeader(token))
      .send({
        type: 'PF',
        name: `Cliente Quota ${plate}`,
        phone: '11988887777',
        whatsapp: '11988887777',
        email: `quota-${plate.toLowerCase()}@example.com`,
        city: 'São Paulo',
        state: 'SP',
      })
      .expect(201);

    const vehicle = await request(app.getHttpServer())
      .post('/api/vehicles')
      .set(authHeader(token))
      .send({
        customerId: customer.body.id,
        plate,
        manufacturer: 'Chevrolet',
        model: 'Onix',
        modelYear: 2020,
        fuel: 'FLEX',
        currentKm: 51000,
      })
      .expect(201);

    return { customerId: customer.body.id, vehicleId: vehicle.body.id };
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

  it('aplica quota mensal de OS sem criar registro extra', async () => {
    await assignPlanWithLimits('os-one-e2e', 'Uma OS mensal E2E', [
      { feature: 'SERVICE_ORDERS_MONTH', enabled: true, limit: 1 },
    ]);

    const admin = await loginAs(app);
    const first = await createCustomerAndVehicle(admin.token, 'QTA1A01');
    const second = await createCustomerAndVehicle(admin.token, 'QTA1A02');

    await request(app.getHttpServer())
      .post('/api/service-orders')
      .set(authHeader(admin.token))
      .send({
        customerId: first.customerId,
        vehicleId: first.vehicleId,
        reportedProblem: 'Primeira OS dentro da quota mensal.',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/service-orders')
      .set(authHeader(admin.token))
      .send({
        customerId: second.customerId,
        vehicleId: second.vehicleId,
        reportedProblem: 'Segunda OS deve ser bloqueada pela quota mensal.',
      })
      .expect(402);

    const orders = await prisma.serviceOrder.count({ where: { tenantId: seed.tenant.id } });
    expect(orders).toBe(1);

    const usage = await request(app.getHttpServer())
      .get('/api/billing/usage')
      .set(authHeader(admin.token))
      .expect(200);
    const osUsage = usage.body.usage.find(
      (row: { feature: string }) => row.feature === 'SERVICE_ORDERS_MONTH',
    );
    expect(osUsage.used).toBe(1);
    expect(osUsage.limit).toBe(1);
  });

  it('aplica quota de armazenamento em MB antes de persistir o upload', async () => {
    await assignPlanWithLimits('storage-zero-e2e', 'Sem armazenamento E2E', [
      { feature: 'STORAGE_MB', enabled: true, limit: 0 },
      { feature: 'UPLOADS_MONTH', enabled: true, limit: 10 },
    ]);

    const admin = await loginAs(app);
    const tinyGif = Buffer.from(
      '47494638396101000100800000000000ffffff2c00000000010001000002024401003b',
      'hex',
    );

    await request(app.getHttpServer())
      .post('/api/uploads')
      .set(authHeader(admin.token))
      .attach('file', tinyGif, {
        filename: 'sem-armazenamento.gif',
        contentType: 'image/gif',
      })
      .expect(402);

    const assets = await prisma.uploadAsset.count({ where: { tenantId: seed.tenant.id } });
    expect(assets).toBe(0);

    const usage = await request(app.getHttpServer())
      .get('/api/billing/usage')
      .set(authHeader(admin.token))
      .expect(200);
    const storage = usage.body.usage.find(
      (row: { feature: string }) => row.feature === 'STORAGE_MB',
    );
    const uploads = usage.body.usage.find(
      (row: { feature: string }) => row.feature === 'UPLOADS_MONTH',
    );
    expect(storage.used).toBe(0);
    expect(storage.limit).toBe(0);
    expect(uploads.used).toBe(0);
  });

  it('aplica quota mensal de uploads de forma transacional', async () => {
    await assignPlanWithLimits('upload-one-e2e', 'Um upload mensal E2E', [
      { feature: 'UPLOADS_MONTH', enabled: true, limit: 1 },
      { feature: 'STORAGE_MB', enabled: true, limit: 10 },
    ]);

    const admin = await loginAs(app);
    const tinyGif = Buffer.from(
      '47494638396101000100800000000000ffffff2c00000000010001000002024401003b',
      'hex',
    );

    await request(app.getHttpServer())
      .post('/api/uploads')
      .set(authHeader(admin.token))
      .attach('file', tinyGif, {
        filename: 'primeiro-upload.gif',
        contentType: 'image/gif',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/uploads')
      .set(authHeader(admin.token))
      .attach('file', tinyGif, {
        filename: 'segundo-upload.gif',
        contentType: 'image/gif',
      })
      .expect(402);

    const assets = await prisma.uploadAsset.count({ where: { tenantId: seed.tenant.id } });
    expect(assets).toBe(1);

    const usage = await request(app.getHttpServer())
      .get('/api/billing/usage')
      .set(authHeader(admin.token))
      .expect(200);
    const uploads = usage.body.usage.find(
      (row: { feature: string }) => row.feature === 'UPLOADS_MONTH',
    );
    expect(uploads.used).toBe(1);
    expect(uploads.limit).toBe(1);
  });
});
