import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './support/e2e-app';
import { OTHER_TENANT_SLUG, resetAndSeed, TEST_PASSWORD } from './support/e2e-db';
import { authHeader, loginAs } from './support/e2e-http';

describe('RBAC e isolamento multi-tenant (e2e)', () => {
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

  async function createCustomerVehicleAndOrder(token: string) {
    const customer = await request(app.getHttpServer())
      .post('/api/customers')
      .set(authHeader(token))
      .send({
        type: 'PF',
        name: 'Cliente RBAC',
        phone: '11988887777',
        email: 'cliente.rbac@example.com',
      })
      .expect(201);

    const vehicle = await request(app.getHttpServer())
      .post('/api/vehicles')
      .set(authHeader(token))
      .send({
        customerId: customer.body.id,
        plate: 'RBC1A23',
        manufacturer: 'Toyota',
        model: 'Corolla',
        modelYear: 2021,
        currentKm: 55000,
      })
      .expect(201);

    const order = await request(app.getHttpServer())
      .post('/api/service-orders')
      .set(authHeader(token))
      .send({
        customerId: customer.body.id,
        vehicleId: vehicle.body.id,
        km: 55200,
        reportedProblem: 'Barulho na suspensão dianteira.',
      })
      .expect(201);

    return { customer: customer.body, vehicle: vehicle.body, order: order.body };
  }

  it('técnico pode diagnosticar OS, mas não pode executar escrita administrativa', async () => {
    const admin = await loginAs(app);
    const { order } = await createCustomerVehicleAndOrder(admin.token);

    const tecnico = await loginAs(app, { email: 'tecnico@oficina.local' });

    const diagnosis = await request(app.getHttpServer())
      .patch(`/api/service-orders/${order.id}/diagnosis`)
      .set(authHeader(tecnico.token))
      .send({
        diagnosis: 'Amortecedor dianteiro com folga e bieleta desgastada.',
        notes: 'Recomendada troca em par.',
      })
      .expect(200);

    expect(diagnosis.body.diagnosis).toContain('Amortecedor');
    expect(diagnosis.body.notes).toBe('Recomendada troca em par.');

    await request(app.getHttpServer())
      .patch(`/api/service-orders/${order.id}`)
      .set(authHeader(tecnico.token))
      .send({ notes: 'Tentativa de escrita sem os:write' })
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/customers')
      .set(authHeader(tecnico.token))
      .send({ name: 'Cliente não permitido' })
      .expect(403);
  });

  it('estoquista pode gerir peças e compras, mas não pode criar OS', async () => {
    const estoque = await loginAs(app, { email: 'estoque@oficina.local' });

    const part = await request(app.getHttpServer())
      .post('/api/parts')
      .set(authHeader(estoque.token))
      .send({
        name: 'Filtro de ar RBAC',
        sku: 'RBAC-FILTRO-AR',
        unit: 'UN',
        initialStock: 4,
        minStock: 2,
        costPrice: 25,
        salePrice: 60,
      })
      .expect(201);

    expect(part.body.currentStock).toBe(4);

    await request(app.getHttpServer())
      .post('/api/service-orders')
      .set(authHeader(estoque.token))
      .send({
        customerId: 'qualquer',
        vehicleId: 'qualquer',
        reportedProblem: 'Sem permissão para criar OS.',
      })
      .expect(403);
  });

  it('não permite que outro tenant leia registros de clientes, veículos ou OS', async () => {
    const admin = await loginAs(app);
    const { customer, vehicle, order } = await createCustomerVehicleAndOrder(admin.token);

    const other = await loginAs(app, {
      tenantSlug: OTHER_TENANT_SLUG,
      email: 'admin@concorrente.local',
      password: TEST_PASSWORD,
    });

    await request(app.getHttpServer())
      .get(`/api/customers/${customer.id}`)
      .set(authHeader(other.token))
      .expect(404);

    await request(app.getHttpServer())
      .get(`/api/vehicles/${vehicle.id}`)
      .set(authHeader(other.token))
      .expect(404);

    await request(app.getHttpServer())
      .get(`/api/service-orders/${order.id}`)
      .set(authHeader(other.token))
      .expect(404);
  });
});
