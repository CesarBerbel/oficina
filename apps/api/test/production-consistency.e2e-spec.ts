import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './support/e2e-app';
import { prisma, resetAndSeed, type SeedData } from './support/e2e-db';
import { authHeader, loginAs } from './support/e2e-http';

describe('Consistência de produção: sessões, estorno e reservas (e2e)', () => {
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

  it('logout global invalida imediatamente o access token já emitido', async () => {
    const admin = await loginAs(app);

    await request(app.getHttpServer()).get('/api/auth/me').set(authHeader(admin.token)).expect(200);

    await request(app.getHttpServer())
      .post('/api/auth/logout-all')
      .set(authHeader(admin.token))
      .set('Cookie', admin.cookie)
      .expect(204);

    await request(app.getHttpServer()).get('/api/auth/me').set(authHeader(admin.token)).expect(401);
  });

  it('revogar a sessão atual invalida imediatamente o access token daquela sessão', async () => {
    const admin = await loginAs(app);

    const sessions = await request(app.getHttpServer())
      .get('/api/auth/sessions')
      .set(authHeader(admin.token))
      .set('Cookie', admin.cookie)
      .expect(200);

    const current = (sessions.body as Array<{ id: string; current: boolean }>).find(
      (session) => session.current,
    );
    expect(current).toBeTruthy();

    await request(app.getHttpServer())
      .delete(`/api/auth/sessions/${current!.id}`)
      .set(authHeader(admin.token))
      .set('Cookie', admin.cookie)
      .expect(204);

    await request(app.getHttpServer()).get('/api/auth/me').set(authHeader(admin.token)).expect(401);
  });

  it('estorno financeiro concorrente só aplica uma vez', async () => {
    const admin = await loginAs(app);
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const created = await request(app.getHttpServer())
      .post('/api/financial/entries')
      .set(authHeader(admin.token))
      .send({
        type: 'RECEIVABLE',
        description: 'Recebível concorrente E2E',
        dueDate,
        amount: 100,
      })
      .expect(201);

    const paid = await request(app.getHttpServer())
      .post(`/api/financial/entries/${created.body.id}/pay`)
      .set(authHeader(admin.token))
      .send({ amount: 100, method: 'PIX' })
      .expect(201);

    const paymentId = paid.body.payments[0].id as string;

    const attempts = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/financial/entries/${created.body.id}/payments/${paymentId}/reverse`)
        .set(authHeader(admin.token))
        .send({ reason: 'Estorno concorrente A' }),
      request(app.getHttpServer())
        .post(`/api/financial/entries/${created.body.id}/payments/${paymentId}/reverse`)
        .set(authHeader(admin.token))
        .send({ reason: 'Estorno concorrente B' }),
    ]);

    const statuses = attempts.map((res) => res.status).sort();
    expect(statuses).toEqual([201, 409]);

    const entry = await prisma.financialEntry.findUniqueOrThrow({
      where: { id: created.body.id },
      include: { payments: true, ledger: true, accountingJournals: true },
    });
    expect(Number(entry.paidAmount)).toBe(0);
    expect(Number(entry.remainingAmount)).toBe(100);
    expect(entry.status).toBe('OPEN');
    expect(entry.payments[0].reversedAt).not.toBeNull();
    expect(entry.ledger.filter((row) => row.kind === 'PAYMENT_REVERSAL')).toHaveLength(1);
    expect(entry.accountingJournals.filter((row) => row.kind === 'PAYMENT_REVERSAL')).toHaveLength(
      1,
    );
  });

  it('reconciliador corrige divergência entre StockReservation e PartStock/OS', async () => {
    const admin = await loginAs(app);
    const suffix = Date.now().toString(36);

    const customer = await prisma.customer.create({
      data: { tenantId: seed.tenant.id, name: `Cliente Reconciliação ${suffix}` },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        tenantId: seed.tenant.id,
        customerId: customer.id,
        plate: `REC${suffix.slice(-4).toUpperCase()}`,
        manufacturer: 'VW',
        model: 'Gol',
      },
    });
    const order = await prisma.serviceOrder.create({
      data: {
        tenantId: seed.tenant.id,
        number: 99001,
        publicToken: `reconcile-${suffix}`,
        customerId: customer.id,
        vehicleId: vehicle.id,
        reportedProblem: 'Teste de reconciliação de reserva',
        partsReserved: false,
      },
    });
    const part = await prisma.part.create({
      data: {
        tenantId: seed.tenant.id,
        name: `Peça Reconciliação ${suffix}`,
        unit: 'UN',
        minStock: 1,
        costPrice: 10,
        salePrice: 20,
      },
    });
    await prisma.partStock.create({
      data: { tenantId: seed.tenant.id, partId: part.id, currentStock: 10, reservedStock: 0 },
    });
    await prisma.stockReservation.create({
      data: {
        tenantId: seed.tenant.id,
        serviceOrderId: order.id,
        partId: part.id,
        quantity: 3,
        status: 'ACTIVE',
        reason: 'Divergência intencional E2E',
      },
    });

    const before = await request(app.getHttpServer())
      .get('/api/parts/reservations/reconciliation')
      .set(authHeader(admin.token))
      .expect(200);
    expect(before.body.totals.stockIssues).toBeGreaterThanOrEqual(1);
    expect(before.body.issues.some((issue: { partId: string }) => issue.partId === part.id)).toBe(
      true,
    );
    expect(
      before.body.serviceOrderIssues.some(
        (issue: { serviceOrderId: string }) => issue.serviceOrderId === order.id,
      ),
    ).toBe(true);

    const result = await request(app.getHttpServer())
      .post('/api/parts/reservations/reconcile')
      .set(authHeader(admin.token))
      .expect(201);
    expect(result.body.fixedPartStocks).toBeGreaterThanOrEqual(1);
    expect(result.body.fixedServiceOrders).toBeGreaterThanOrEqual(1);

    const stock = await prisma.partStock.findUniqueOrThrow({
      where: { tenantId_partId: { tenantId: seed.tenant.id, partId: part.id } },
    });
    const fixedOrder = await prisma.serviceOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(Number(stock.reservedStock)).toBe(3);
    expect(fixedOrder.partsReserved).toBe(true);

    const after = await request(app.getHttpServer())
      .get('/api/parts/reservations/reconciliation')
      .set(authHeader(admin.token))
      .expect(200);
    expect(after.body.issues.some((issue: { partId: string }) => issue.partId === part.id)).toBe(
      false,
    );
    expect(
      after.body.serviceOrderIssues.some(
        (issue: { serviceOrderId: string }) => issue.serviceOrderId === order.id,
      ),
    ).toBe(false);
  });
});
