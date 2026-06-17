import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './support/e2e-app';
import { partStockOf, resetAndSeed, type SeedData } from './support/e2e-db';
import { authHeader, loginAs } from './support/e2e-http';

describe('Compras e recebimento de estoque (e2e)', () => {
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

  async function createPartAndPurchase(token: string) {
    const part = await request(app.getHttpServer())
      .post('/api/parts')
      .set(authHeader(token))
      .send({
        name: 'Pastilha de freio E2E',
        sku: 'PASTILHA-E2E',
        unit: 'JG',
        initialStock: 0,
        minStock: 1,
        costPrice: 90,
        salePrice: 180,
      })
      .expect(201);

    const purchase = await request(app.getHttpServer())
      .post('/api/purchase-orders')
      .set(authHeader(token))
      .send({
        notes: 'Pedido E2E manual',
        items: [{ partId: part.body.id, quantity: 4, unitCost: 90 }],
      })
      .expect(201);

    return { part: part.body, purchase: purchase.body };
  }

  it('cria pedido manual e recebe parcialmente/totalmente atualizando estoque', async () => {
    const admin = await loginAs(app);
    const { part, purchase } = await createPartAndPurchase(admin.token);
    const item = purchase.items[0];

    expect(purchase.status).toBe('ABERTO');
    expect(purchase.total).toBe(360);

    const firstReceipt = await request(app.getHttpServer())
      .post(`/api/purchase-orders/${purchase.id}/receive`)
      .set(authHeader(admin.token))
      .send({ received: [{ itemId: item.id, quantity: 2 }] })
      .expect(201);

    expect(firstReceipt.body.status).toBe('PARCIALMENTE_RECEBIDO');
    expect(firstReceipt.body.items[0].receivedQuantity).toBe(2);

    let stock = await partStockOf(seed.tenant.id, part.id);
    expect(stock.currentStock).toBe(2);

    const secondReceipt = await request(app.getHttpServer())
      .post(`/api/purchase-orders/${purchase.id}/receive`)
      .set(authHeader(admin.token))
      .send({ received: [{ itemId: item.id, quantity: 2 }] })
      .expect(201);

    expect(secondReceipt.body.status).toBe('RECEBIDO');
    expect(secondReceipt.body.items[0].receivedQuantity).toBe(4);

    stock = await partStockOf(seed.tenant.id, part.id);
    expect(stock.currentStock).toBe(4);
  });

  it('bloqueia recebimento inválido: item duplicado, item externo, quantidade zero e excesso', async () => {
    const admin = await loginAs(app);
    const { purchase } = await createPartAndPurchase(admin.token);
    const item = purchase.items[0];

    await request(app.getHttpServer())
      .post(`/api/purchase-orders/${purchase.id}/receive`)
      .set(authHeader(admin.token))
      .send({
        received: [
          { itemId: item.id, quantity: 1 },
          { itemId: item.id, quantity: 1 },
        ],
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/purchase-orders/${purchase.id}/receive`)
      .set(authHeader(admin.token))
      .send({ received: [{ itemId: 'item-inexistente', quantity: 1 }] })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/purchase-orders/${purchase.id}/receive`)
      .set(authHeader(admin.token))
      .send({ received: [{ itemId: item.id, quantity: 0 }] })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/purchase-orders/${purchase.id}/receive`)
      .set(authHeader(admin.token))
      .send({ received: [{ itemId: item.id, quantity: 5 }] })
      .expect(400);
  });

  it('impede receber pedido cancelado', async () => {
    const admin = await loginAs(app);
    const { purchase } = await createPartAndPurchase(admin.token);
    const item = purchase.items[0];

    const canceled = await request(app.getHttpServer())
      .post(`/api/purchase-orders/${purchase.id}/status`)
      .set(authHeader(admin.token))
      .send({ status: 'CANCELADO' })
      .expect(201);
    expect(canceled.body.status).toBe('CANCELADO');

    await request(app.getHttpServer())
      .post(`/api/purchase-orders/${purchase.id}/receive`)
      .set(authHeader(admin.token))
      .send({ received: [{ itemId: item.id, quantity: 1 }] })
      .expect(400);
  });
});
