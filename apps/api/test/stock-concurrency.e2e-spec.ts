import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './support/e2e-app';
import { partStockOf, resetAndSeed, type SeedData } from './support/e2e-db';
import { authHeader, loginAs } from './support/e2e-http';

/**
 * Concorrência de estoque: a baixa condicional atômica (PartStock) impede vender
 * a descoberto mesmo com requisições simultâneas.
 */
describe('Concorrência de estoque (e2e)', () => {
  let app: INestApplication;
  let seed: SeedData;

  beforeAll(async () => {
    app = await createE2eApp();
  });

  beforeEach(async () => {
    seed = await resetAndSeed();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('não vende a descoberto: 8 saídas paralelas de 1 em estoque 5 → 5 ok, 3 falham, saldo 0', async () => {
    const admin = await loginAs(app);

    const part = await request(app.getHttpServer())
      .post('/api/parts')
      .set(authHeader(admin.token))
      .send({
        name: 'Vela de ignição E2E',
        sku: 'VELA-CONC',
        unit: 'UN',
        initialStock: 5,
        minStock: 0,
        costPrice: 15,
        salePrice: 40,
      })
      .expect(201);

    const attempts = 8;
    const results = await Promise.all(
      Array.from({ length: attempts }, () =>
        request(app.getHttpServer())
          .post(`/api/parts/${part.body.id}/movements`)
          .set(authHeader(admin.token))
          .send({ type: 'SAIDA', quantity: 1, note: 'Baixa concorrente' })
          .then((res) => res.status),
      ),
    );

    const ok = results.filter((s) => s === 201).length;
    const failed = results.filter((s) => s === 400).length;

    expect(ok).toBe(5);
    expect(failed).toBe(3);

    // Saldo nunca fica negativo e termina exatamente em 0.
    const stock = await partStockOf(seed.tenant.id, part.body.id);
    expect(stock.currentStock).toBe(0);
  });

  it('consumo concorrente respeitando o saldo: 6 saídas de 2 em estoque 10 → 5 ok, saldo 0', async () => {
    const admin = await loginAs(app);

    const part = await request(app.getHttpServer())
      .post('/api/parts')
      .set(authHeader(admin.token))
      .send({
        name: 'Pastilha E2E conc',
        sku: 'PAST-CONC',
        unit: 'JG',
        initialStock: 10,
        minStock: 0,
        costPrice: 80,
        salePrice: 160,
      })
      .expect(201);

    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        request(app.getHttpServer())
          .post(`/api/parts/${part.body.id}/movements`)
          .set(authHeader(admin.token))
          .send({ type: 'SAIDA', quantity: 2 })
          .then((res) => res.status),
      ),
    );

    expect(results.filter((s) => s === 201).length).toBe(5);
    expect(results.filter((s) => s === 400).length).toBe(1);
    expect((await partStockOf(seed.tenant.id, part.body.id)).currentStock).toBe(0);
  });
});
