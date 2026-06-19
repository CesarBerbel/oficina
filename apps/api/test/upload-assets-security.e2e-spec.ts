import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TenantDomainsService } from '../src/modules/tenant-domains/tenant-domains.service';
import { createE2eApp } from './support/e2e-app';
import { OTHER_TENANT_SLUG, prisma, resetAndSeed, type SeedData } from './support/e2e-db';
import { authHeader, loginAs } from './support/e2e-http';

const TINY_GIF = Buffer.from(
  '47494638396101000100800000000000ffffff2c00000000010001000002024401003b',
  'hex',
);

async function createBasicOrder(app: INestApplication, token: string, suffix: string) {
  const customer = await request(app.getHttpServer())
    .post('/api/customers')
    .set(authHeader(token))
    .send({ type: 'PF', name: `Cliente Upload ${suffix}`, email: `upload-${suffix}@example.com` })
    .expect(201);

  const vehicle = await request(app.getHttpServer())
    .post('/api/vehicles')
    .set(authHeader(token))
    .send({
      customerId: customer.body.id,
      plate: `UPL${suffix.padStart(4, '0').slice(-4)}`,
      manufacturer: 'Fiat',
      model: 'Pulse',
      modelYear: 2022,
      fuel: 'FLEX',
    })
    .expect(201);

  const order = await request(app.getHttpServer())
    .post('/api/service-orders')
    .set(authHeader(token))
    .send({
      customerId: customer.body.id,
      vehicleId: vehicle.body.id,
      reportedProblem: 'Teste de anexos internos de upload.',
    })
    .expect(201);

  return { customer: customer.body, vehicle: vehicle.body, order: order.body } as {
    customer: { id: string };
    vehicle: { id: string };
    order: { id: string };
  };
}

async function uploadGif(app: INestApplication, token: string, filename: string) {
  const res = await request(app.getHttpServer())
    .post('/api/uploads')
    .set(authHeader(token))
    .attach('file', TINY_GIF, { filename, contentType: 'image/gif' })
    .expect(201);
  return res.body as { id: string; url: string };
}

describe('Uploads: quota, ownership e bloqueio de URL externa (e2e)', () => {
  let app: INestApplication;
  let seed: SeedData;
  const previousAppUrl = process.env.APP_URL;

  beforeAll(async () => {
    process.env.APP_URL = 'http://localhost:3000';
    app = await createE2eApp();
  });

  beforeEach(async () => {
    seed = await resetAndSeed();
  });

  afterAll(async () => {
    if (previousAppUrl == null) delete process.env.APP_URL;
    else process.env.APP_URL = previousAppUrl;
    await app?.close();
  });

  async function makeSuperAdmin() {
    await prisma.user.update({ where: { id: seed.tenant.admin.id }, data: { superAdmin: true } });
    return loginAs(app);
  }

  it('registra UploadAsset com ownership do tenant e URL pública controlada', async () => {
    const admin = await loginAs(app);
    const upload = await uploadGif(app, admin.token, 'ownership.gif');

    expect(upload.id).toEqual(expect.any(String));
    expect(upload.url).toMatch(/^http:\/\/localhost:3000\/uploads\/[a-f0-9]{32}\.gif$/);

    const asset = await prisma.uploadAsset.findUniqueOrThrow({ where: { id: upload.id } });
    expect(asset.tenantId).toBe(seed.tenant.id);
    expect(asset.createdById).toBe(seed.tenant.admin.id);
    expect(asset.filename).toMatch(/^[a-f0-9]{32}\.gif$/);
    expect(asset.path).toBe(`/uploads/${asset.filename}`);
    expect(asset.url).toBe(upload.url);
    expect(asset.mime).toBe('image/gif');
    expect(asset.sizeBytes).toBe(TINY_GIF.length);
  });

  it('aplica quota mensal de uploads e não consome quota em arquivo inválido', async () => {
    const superAdmin = await makeSuperAdmin();
    const account = await prisma.account.findUniqueOrThrow({ where: { slug: seed.tenant.slug } });

    const plan = await request(app.getHttpServer())
      .post('/api/platform/plans')
      .set(authHeader(superAdmin.token))
      .send({
        code: `uploads-one-${Date.now()}`,
        name: 'Um upload por mês E2E',
        limits: [{ feature: 'UPLOADS_MONTH', enabled: true, limit: 1 }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/platform/plans/accounts/${account.id}`)
      .set(authHeader(superAdmin.token))
      .send({ planId: plan.body.id, status: 'ACTIVE' })
      .expect(201);

    const admin = await loginAs(app);
    await request(app.getHttpServer())
      .post('/api/uploads')
      .set(authHeader(admin.token))
      .attach('file', Buffer.from('nao-e-imagem'), {
        filename: 'fake.png',
        contentType: 'image/png',
      })
      .expect(400);

    await uploadGif(app, admin.token, 'quota-ok.gif');

    await request(app.getHttpServer())
      .post('/api/uploads')
      .set(authHeader(admin.token))
      .attach('file', TINY_GIF, { filename: 'quota-block.gif', contentType: 'image/gif' })
      .expect(402);

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

  it('permite anexar foto interna do mesmo tenant na timeline técnica', async () => {
    const admin = await loginAs(app);
    const { order } = await createBasicOrder(app, admin.token, '101');
    const upload = await uploadGif(app, admin.token, 'internal-photo.gif');

    const timeline = await request(app.getHttpServer())
      .post(`/api/service-orders/${order.id}/technical-update`)
      .set(authHeader(admin.token))
      .send({ description: 'Foto interna válida.', public: true, photos: [upload.url] })
      .expect(201);

    expect(timeline.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'PHOTOS', photos: [upload.url], visibility: 'PUBLIC' }),
      ]),
    );
  });

  it('bloqueia URL externa em timeline técnica mesmo quando o path parece upload interno', async () => {
    const admin = await loginAs(app);
    const { order } = await createBasicOrder(app, admin.token, '102');
    const external = 'https://evil.example.com/uploads/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.gif';

    await request(app.getHttpServer())
      .post(`/api/service-orders/${order.id}/technical-update`)
      .set(authHeader(admin.token))
      .send({ description: 'URL externa maliciosa.', public: true, photos: [external] })
      .expect(400);
  });

  it('bloqueia uso de upload pertencente a outro tenant', async () => {
    const admin = await loginAs(app);
    const upload = await uploadGif(app, admin.token, 'tenant-a.gif');

    const otherAdmin = await loginAs(app, {
      tenantSlug: OTHER_TENANT_SLUG,
      email: seed.otherTenant.admin.email,
    });
    const { order } = await createBasicOrder(app, otherAdmin.token, '201');

    await request(app.getHttpServer())
      .post(`/api/service-orders/${order.id}/technical-update`)
      .set(authHeader(otherAdmin.token))
      .send({ description: 'Tentativa cross-tenant.', photos: [upload.url] })
      .expect(400);
  });

  it('bloqueia URL externa e upload de outro tenant no check-in', async () => {
    const admin = await loginAs(app);
    const upload = await uploadGif(app, admin.token, 'checkin-tenant-a.gif');

    const otherAdmin = await loginAs(app, {
      tenantSlug: OTHER_TENANT_SLUG,
      email: seed.otherTenant.admin.email,
    });
    const { order, vehicle } = await createBasicOrder(app, otherAdmin.token, '301');

    await request(app.getHttpServer())
      .post('/api/checkins')
      .set(authHeader(otherAdmin.token))
      .send({ serviceOrderId: order.id, vehicleId: vehicle.id, photos: [upload.url] })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/checkins')
      .set(authHeader(otherAdmin.token))
      .send({
        serviceOrderId: order.id,
        vehicleId: vehicle.id,
        photos: ['https://evil.example.com/uploads/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.gif'],
      })
      .expect(400);
  });

  it('continua servindo o arquivo validado com headers seguros', async () => {
    const service = app.get(TenantDomainsService);
    expect(await service.isAllowedOrigin('http://localhost:3000')).toBe(true);

    const admin = await loginAs(app);
    const upload = await uploadGif(app, admin.token, 'public-read.gif');
    const publicPath = new URL(upload.url).pathname;

    await request(app.getHttpServer())
      .get(publicPath)
      .expect('X-Content-Type-Options', 'nosniff')
      .expect(200);
  });
});
