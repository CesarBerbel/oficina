import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './support/e2e-app';
import {
  createBranchTenant,
  partStockOf,
  resetAndSeed,
  type SeedData,
} from './support/e2e-db';
import { authHeader, loginAs } from './support/e2e-http';

/**
 * Multi-tenant: catálogo e clientes são compartilhados no grupo (matriz+filiais),
 * o estoque é por filial, e tenants independentes continuam isolados.
 *
 * Um único teste para respeitar o rate limit de login (5/min) — loga matriz,
 * filial e outro tenant uma vez cada.
 */
describe('Multi-tenant: compartilhamento matriz/filial e isolamento (e2e)', () => {
  let app: INestApplication;
  let seed: SeedData;
  let branch: { id: string; slug: string; admin: { email: string } };

  beforeAll(async () => {
    app = await createE2eApp();
    seed = await resetAndSeed();
    branch = await createBranchTenant(seed.tenant.id, { slug: 'filial-centro' });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('compartilha clientes/catálogo no grupo, isola estoque por filial e isola outros tenants', async () => {
    const matriz = await loginAs(app);
    const filial = await loginAs(app, {
      tenantSlug: branch.slug,
      email: branch.admin.email,
    });
    const outro = await loginAs(app, {
      tenantSlug: seed.otherTenant.slug,
      email: seed.otherTenant.admin.email,
    });

    // Matriz cria cliente + peça (estoque inicial 10 na matriz).
    const customer = await request(app.getHttpServer())
      .post('/api/customers')
      .set(authHeader(matriz.token))
      .send({ type: 'PF', name: 'Cliente do Grupo' })
      .expect(201);

    const part = await request(app.getHttpServer())
      .post('/api/parts')
      .set(authHeader(matriz.token))
      .send({
        name: 'Óleo 5W30 E2E',
        sku: 'OLEO-GRUPO',
        unit: 'L',
        initialStock: 10,
        minStock: 2,
        costPrice: 30,
        salePrice: 60,
      })
      .expect(201);

    // Filial enxerga o cliente (compartilhado).
    const filialCustomers = await request(app.getHttpServer())
      .get('/api/customers')
      .set(authHeader(filial.token))
      .expect(200);
    expect(
      filialCustomers.body.data.map((c: { id: string }) => c.id),
    ).toContain(customer.body.id);

    // Filial enxerga a peça (catálogo compartilhado) com saldo 0 (estoque por filial).
    const filialPart = await request(app.getHttpServer())
      .get(`/api/parts/${part.body.id}`)
      .set(authHeader(filial.token))
      .expect(200);
    expect(filialPart.body.currentStock).toBe(0);

    // Entrada de 5 na filial não afeta a matriz.
    await request(app.getHttpServer())
      .post(`/api/parts/${part.body.id}/movements`)
      .set(authHeader(filial.token))
      .send({ type: 'ENTRADA', quantity: 5, note: 'Entrada na filial' })
      .expect(201);

    expect((await partStockOf(branch.id, part.body.id)).currentStock).toBe(5);
    expect((await partStockOf(seed.tenant.id, part.body.id)).currentStock).toBe(10);

    // Tenant independente NÃO enxerga o cliente do grupo.
    const outroCustomers = await request(app.getHttpServer())
      .get('/api/customers')
      .set(authHeader(outro.token))
      .expect(200);
    expect(
      outroCustomers.body.data.map((c: { id: string }) => c.id),
    ).not.toContain(customer.body.id);

    await request(app.getHttpServer())
      .get(`/api/customers/${customer.body.id}`)
      .set(authHeader(outro.token))
      .expect(404);
  });
});
