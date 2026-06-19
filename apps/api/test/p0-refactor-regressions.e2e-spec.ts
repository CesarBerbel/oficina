import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { OutboxService } from '@/modules/outbox/outbox.service';
import { createE2eApp } from './support/e2e-app';
import { prisma, resetAndSeed, type SeedData } from './support/e2e-db';
import { authHeader, loginAs } from './support/e2e-http';

async function createBasicOrder(app: INestApplication, token: string) {
  const customer = await request(app.getHttpServer())
    .post('/api/customers')
    .set(authHeader(token))
    .send({ type: 'PF', name: 'Cliente Regressão', email: 'regressao@example.com' })
    .expect(201);

  const vehicle = await request(app.getHttpServer())
    .post('/api/vehicles')
    .set(authHeader(token))
    .send({
      customerId: customer.body.id,
      plate: `REG${Math.floor(Math.random() * 9)}A${Math.floor(Math.random() * 90 + 10)}`,
      manufacturer: 'Volkswagen',
      model: 'Gol',
      modelYear: 2021,
      fuel: 'FLEX',
    })
    .expect(201);

  const order = await request(app.getHttpServer())
    .post('/api/service-orders')
    .set(authHeader(token))
    .send({
      customerId: customer.body.id,
      vehicleId: vehicle.body.id,
      reportedProblem: 'Fluxo de regressão',
    })
    .expect(201);

  return order.body as { id: string; publicToken: string };
}

describe('Regressões P0/refactor (e2e)', () => {
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

  it('RBAC explícito preserva acesso de super admin aos endpoints de plataforma', async () => {
    await prisma.user.updateMany({
      where: { email: 'admin@oficina.local' },
      data: { superAdmin: true },
    });
    const platform = await loginAs(app);

    await request(app.getHttpServer())
      .get('/api/platform/accounts/overview')
      .set(authHeader(platform.token))
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/platform/tenants')
      .set(authHeader(platform.token))
      .expect(200);
  });

  it('item manual de OS ignora sourcePartId/sourceServiceId forjados', async () => {
    const admin = await loginAs(app);
    const order = await createBasicOrder(app, admin.token);

    const foreignPart = await prisma.part.create({
      data: {
        tenantId: seed.otherTenant.id,
        name: 'Peça externa forjada',
        sku: 'FORJADA-E2E',
        unit: 'UN',
        costPrice: 10,
        salePrice: 20,
      },
    });

    await request(app.getHttpServer())
      .post(`/api/service-orders/${order.id}/items`)
      .set(authHeader(admin.token))
      .send({
        kind: 'PART',
        description: 'Item manual seguro',
        quantity: 1,
        unitPrice: 20,
        sourcePartId: foreignPart.id,
        sourceServiceId: 'servico-forjado',
      })
      .expect(201);

    const item = await prisma.serviceOrderItem.findFirstOrThrow({
      where: { serviceOrderId: order.id, description: 'Item manual seguro' },
      select: { sourcePartId: true, sourceServiceId: true },
    });
    expect(item.sourcePartId).toBeNull();
    expect(item.sourceServiceId).toBeNull();
  });

  it('aprovação de orçamento cria reserva formal de estoque e expõe a reserva na OS', async () => {
    const admin = await loginAs(app);
    const order = await createBasicOrder(app, admin.token);

    const part = await request(app.getHttpServer())
      .post('/api/parts')
      .set(authHeader(admin.token))
      .send({
        name: 'Filtro regressão reserva',
        sku: 'RESERVA-REG',
        unit: 'UN',
        initialStock: 5,
        minStock: 0,
        costPrice: 30,
        salePrice: 90,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/service-orders/${order.id}/add-part`)
      .set(authHeader(admin.token))
      .send({ partId: part.body.id, quantity: 2 })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/service-orders/${order.id}/diagnosis`)
      .set(authHeader(admin.token))
      .send({ diagnosis: 'Peça aprovada para troca.' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/service-orders/${order.id}/status`)
      .set(authHeader(admin.token))
      .send({ status: 'DIAGNOSTICO_PRONTO' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/service-orders/${order.id}/quote`)
      .set(authHeader(admin.token))
      .send({ publicNotes: 'Aprovação com reserva formal.' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/public/track/${order.publicToken}/quote-decision`)
      .send({
        reject: false,
        itemDecisions: [],
        signatureName: 'Cliente Regressão',
        signatureDoc: '52998224725',
      })
      .expect(201);

    const storedReservations = await prisma.stockReservation.findMany({
      where: { serviceOrderId: order.id, partId: part.body.id, status: 'ACTIVE' },
    });
    expect(storedReservations).toHaveLength(1);
    expect(Number(storedReservations[0].quantity)).toBe(2);

    const listed = await request(app.getHttpServer())
      .get(`/api/service-orders/${order.id}/reservations`)
      .set(authHeader(admin.token))
      .expect(200);
    expect(listed.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ partId: part.body.id, status: 'ACTIVE', quantity: 2 }),
      ]),
    );
  });

  it('journal contábil por partidas dobradas é gerado junto ao ledger financeiro', async () => {
    const admin = await loginAs(app);
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const entry = await request(app.getHttpServer())
      .post('/api/financial/entries')
      .set(authHeader(admin.token))
      .send({
        type: 'RECEIVABLE',
        description: 'Recebível regressão contábil',
        dueDate,
        amount: 150,
      })
      .expect(201);

    const journal = await request(app.getHttpServer())
      .get(`/api/financial/entries/${entry.body.id}/accounting`)
      .set(authHeader(admin.token))
      .expect(200);

    expect(journal.body).toHaveLength(1);
    expect(journal.body[0]).toMatchObject({ kind: 'ISSUE', status: 'POSTED' });
    expect(journal.body[0].lines).toHaveLength(1);
    expect(journal.body[0].lines[0]).toMatchObject({ amount: 150 });
    expect(journal.body[0].lines[0].debit.code).toBe('ACCOUNTS_RECEIVABLE');
    expect(journal.body[0].lines[0].credit.code).toBe('SERVICE_REVENUE');
  });

  it('retry do mesmo outbox não duplica MessageLog do handler idempotente', async () => {
    const admin = await loginAs(app);
    const order = await createBasicOrder(app, admin.token);
    await prisma.outboxMessage.deleteMany({ where: { tenantId: seed.tenant.id } });
    await prisma.messageLog.deleteMany({ where: { tenantId: seed.tenant.id } });

    await prisma.messageTemplate.create({
      data: {
        tenantId: seed.tenant.id,
        name: 'Template regressão outbox',
        event: 'OS_OPENED',
        channel: 'EMAIL',
        body: 'Olá {{cliente.nome}}, OS {{os.numero}} aberta.',
        active: true,
        autoSend: true,
      },
    });

    const outboxMessage = await prisma.outboxMessage.create({
      data: {
        tenantId: seed.tenant.id,
        type: 'ORDER_EVENT',
        payload: { event: 'OS_OPENED', orderId: order.id },
      },
    });

    const outbox = app.get(OutboxService);
    await expect(outbox.processPending()).resolves.toEqual({ done: 1, failed: 0, retried: 0 });

    await prisma.outboxMessage.update({
      where: { id: outboxMessage.id },
      data: { status: 'PENDING', processedAt: null, availableAt: new Date() },
    });
    await expect(outbox.processPending()).resolves.toEqual({ done: 1, failed: 0, retried: 0 });

    const dispatchLogs = await prisma.messageLog.findMany({
      where: { dispatchKey: { startsWith: `outbox:${outboxMessage.id}:template:` } },
    });
    expect(dispatchLogs).toHaveLength(1);
  });
});
