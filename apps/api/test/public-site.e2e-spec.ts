import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './support/e2e-app';
import { OTHER_TENANT_SLUG, prisma, resetAndSeed, TENANT_SLUG } from './support/e2e-db';
import { authHeader, loginAs } from './support/e2e-http';

describe('Site público, leads e resolução de tenant (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createE2eApp();
  });

  beforeEach(async () => {
    await resetAndSeed();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('resolve site publicado por query param, header e rota por slug', async () => {
    const byQuery = await request(app.getHttpServer())
      .get(`/api/public/site?tenantSlug=${TENANT_SLUG}`)
      .expect(200);
    expect(byQuery.body.settings.shopName).toBe('Oficina Modelo');

    const byHeader = await request(app.getHttpServer())
      .get('/api/public/site')
      .set('X-Public-Tenant-Slug', OTHER_TENANT_SLUG)
      .expect(200);
    expect(byHeader.body.settings.shopName).toBe('Oficina Concorrente');

    const bySlug = await request(app.getHttpServer())
      .get(`/api/public/site/by-slug/${TENANT_SLUG}`)
      .expect(200);
    expect(bySlug.body.services).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Revisão preventiva' }),
      ]),
    );
  });

  it('não escolhe tenant implicitamente quando há múltiplos sites publicados', async () => {
    await request(app.getHttpServer()).get('/api/public/site').expect(404);
  });

  it('usa o único site publicado quando o domínio próprio não corresponde ao slug', async () => {
    await prisma.siteSettings.updateMany({
      where: { tenant: { slug: OTHER_TENANT_SLUG } },
      data: { published: false },
    });

    const response = await request(app.getHttpServer())
      .get('/api/public/site')
      .set('X-Public-Host', 'www.automecanicabandeirantes.com.br')
      .expect(200);

    expect(response.body.settings.shopName).toBe('Oficina Modelo');
  });

  it('cria lead público no tenant correto e permite gestão interna do status', async () => {
    await request(app.getHttpServer())
      .post(`/api/public/lead?tenantSlug=${TENANT_SLUG}`)
      .send({
        name: 'Lead Público',
        phone: '11912345678',
        email: 'lead.publico@example.com',
        vehicle: 'Honda Civic 2018',
        message: 'Gostaria de um orçamento para revisão.',
      })
      .expect(201)
      .expect(({ body }) => expect(body.ok).toBe(true));

    const admin = await loginAs(app);
    const leads = await request(app.getHttpServer())
      .get('/api/leads')
      .set(authHeader(admin.token))
      .expect(200);

    expect(leads.body.data).toHaveLength(1);
    expect(leads.body.data[0]).toMatchObject({
      name: 'Lead Público',
      status: 'NOVO',
    });

    const updated = await request(app.getHttpServer())
      .post(`/api/leads/${leads.body.data[0].id}/status`)
      .set(authHeader(admin.token))
      .send({ status: 'EM_ATENDIMENTO' })
      .expect(201);

    expect(updated.body.status).toBe('EM_ATENDIMENTO');
  });
});
