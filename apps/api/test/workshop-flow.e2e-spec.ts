import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './support/e2e-app';
import { partStockOf, resetAndSeed, type SeedData } from './support/e2e-db';
import { authHeader, loginAs } from './support/e2e-http';

describe('Fluxo completo da oficina: cliente → OS → orçamento → compra → entrega (e2e)', () => {
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

  it('executa o fluxo central com falta de peça, aprovação pública, compra, recebimento e entrega', async () => {
    const admin = await loginAs(app);

    const customer = await request(app.getHttpServer())
      .post('/api/customers')
      .set(authHeader(admin.token))
      .send({
        type: 'PF',
        name: 'João Fluxo Completo',
        document: '52998224725',
        phone: '11977778888',
        whatsapp: '11977778888',
        email: 'joao.fluxo@example.com',
        city: 'São Paulo',
        state: 'SP',
      })
      .expect(201);

    const vehicle = await request(app.getHttpServer())
      .post('/api/vehicles')
      .set(authHeader(admin.token))
      .send({
        customerId: customer.body.id,
        plate: 'EEE1A23',
        manufacturer: 'Volkswagen',
        model: 'Gol',
        modelYear: 2019,
        fuel: 'FLEX',
        currentKm: 80200,
      })
      .expect(201);

    const part = await request(app.getHttpServer())
      .post('/api/parts')
      .set(authHeader(admin.token))
      .send({
        name: 'Bieleta dianteira E2E',
        sku: 'BIELETA-E2E',
        unit: 'UN',
        initialStock: 0,
        minStock: 0,
        costPrice: 40,
        salePrice: 120,
      })
      .expect(201);

    const order = await request(app.getHttpServer())
      .post('/api/service-orders')
      .set(authHeader(admin.token))
      .send({
        customerId: customer.body.id,
        vehicleId: vehicle.body.id,
        km: 80300,
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        reportedProblem: 'Ruído metálico ao passar em lombadas.',
      })
      .expect(201);

    expect(order.body.status).toBe('ENTRADA');
    expect(order.body.number).toBe(1);
    expect(order.body.publicToken).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .post(`/api/service-orders/${order.body.id}/quote`)
      .set(authHeader(admin.token))
      .send({ publicNotes: 'Tentativa antes do diagnóstico.' })
      .expect(422);

    await request(app.getHttpServer())
      .post(`/api/service-orders/${order.body.id}/items`)
      .set(authHeader(admin.token))
      .send({
        kind: 'SERVICE',
        description: 'Diagnóstico e troca de bieleta',
        quantity: 1,
        unitPrice: 180,
      })
      .expect(201);

    const orderWithPart = await request(app.getHttpServer())
      .post(`/api/service-orders/${order.body.id}/add-part`)
      .set(authHeader(admin.token))
      .send({
        partId: part.body.id,
        quantity: 2,
      })
      .expect(201);

    expect(orderWithPart.body.total).toBe(420);
    expect(orderWithPart.body.items).toHaveLength(2);

    const diagnosed = await request(app.getHttpServer())
      .patch(`/api/service-orders/${order.body.id}/diagnosis`)
      .set(authHeader(admin.token))
      .send({
        diagnosis: 'Folga nas bieletas dianteiras; troca recomendada.',
      })
      .expect(200);
    expect(diagnosed.body.diagnosis).toContain('Folga');

    await request(app.getHttpServer())
      .post(`/api/service-orders/${order.body.id}/status`)
      .set(authHeader(admin.token))
      .send({ status: 'DIAGNOSTICO_PRONTO', note: 'Diagnóstico finalizado.' })
      .expect(201);

    const quote = await request(app.getHttpServer())
      .post(`/api/service-orders/${order.body.id}/quote`)
      .set(authHeader(admin.token))
      .send({ publicNotes: 'Orçamento válido por 3 dias.' })
      .expect(201);

    expect(quote.body.status).toBe('ENVIADO');
    expect(quote.body.items).toHaveLength(2);
    expect(quote.body.total).toBe(420);

    const tracking = await request(app.getHttpServer())
      .get(`/api/public/track/${order.body.publicToken}`)
      .expect(200);
    expect(tracking.body.number).toBe(1);
    expect(tracking.body.quote.total).toBe(420);

    const approvedQuote = await request(app.getHttpServer())
      .post(`/api/public/track/${order.body.publicToken}/quote-decision`)
      .send({
        reject: false,
        itemDecisions: [],
        signatureName: 'João Fluxo Completo',
        signatureDoc: '52998224725',
      })
      .expect(201);

    expect(approvedQuote.body.status).toBe('APROVADO');
    expect(approvedQuote.body.decisionType).toBe('TOTAL');

    const waitingForPart = await request(app.getHttpServer())
      .get(`/api/service-orders/${order.body.id}`)
      .set(authHeader(admin.token))
      .expect(200);
    expect(waitingForPart.body.status).toBe('AGUARDANDO_PECA');

    const stockAfterApproval = await partStockOf(seed.tenant.id, part.body.id);
    expect(stockAfterApproval.currentStock).toBe(0);
    expect(stockAfterApproval.reservedStock).toBe(2);

    const purchaseGeneration = await request(app.getHttpServer())
      .post(`/api/service-orders/${order.body.id}/quote/generate-purchase`)
      .set(authHeader(admin.token))
      .expect(201);
    expect(purchaseGeneration.body.created).toBe(1);

    const purchases = await request(app.getHttpServer())
      .get('/api/purchase-orders')
      .set(authHeader(admin.token))
      .expect(200);
    expect(purchases.body.data).toHaveLength(1);

    const purchase = await request(app.getHttpServer())
      .get(`/api/purchase-orders/${purchases.body.data[0].id}`)
      .set(authHeader(admin.token))
      .expect(200);
    expect(purchase.body.items[0].quantity).toBe(2);

    await request(app.getHttpServer())
      .post(`/api/purchase-orders/${purchase.body.id}/receive`)
      .set(authHeader(admin.token))
      .send({
        received: [{ itemId: purchase.body.items[0].id, quantity: 3 }],
      })
      .expect(400);

    const partiallyReceived = await request(app.getHttpServer())
      .post(`/api/purchase-orders/${purchase.body.id}/receive`)
      .set(authHeader(admin.token))
      .send({
        received: [{ itemId: purchase.body.items[0].id, quantity: 1 }],
      })
      .expect(201);
    expect(partiallyReceived.body.status).toBe('PARCIALMENTE_RECEBIDO');

    let partStock = await partStockOf(seed.tenant.id, part.body.id);
    expect(partStock.currentStock).toBe(1);
    expect(partStock.reservedStock).toBe(2);

    const received = await request(app.getHttpServer())
      .post(`/api/purchase-orders/${purchase.body.id}/receive`)
      .set(authHeader(admin.token))
      .send({
        received: [{ itemId: purchase.body.items[0].id, quantity: 1 }],
      })
      .expect(201);
    expect(received.body.status).toBe('RECEBIDO');

    const approvedOrder = await request(app.getHttpServer())
      .get(`/api/service-orders/${order.body.id}`)
      .set(authHeader(admin.token))
      .expect(200);
    expect(approvedOrder.body.status).toBe('ORCAMENTO_APROVADO');

    const inExecution = await request(app.getHttpServer())
      .post(`/api/service-orders/${order.body.id}/status`)
      .set(authHeader(admin.token))
      .send({ status: 'EM_EXECUCAO', note: 'Peças recebidas, serviço iniciado.' })
      .expect(201);
    expect(inExecution.body.status).toBe('EM_EXECUCAO');

    partStock = await partStockOf(seed.tenant.id, part.body.id);
    expect(partStock.currentStock).toBe(0);
    expect(partStock.reservedStock).toBe(0);

    await request(app.getHttpServer())
      .post(`/api/service-orders/${order.body.id}/status`)
      .set(authHeader(admin.token))
      .send({ status: 'EM_TESTE' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/service-orders/${order.body.id}/status`)
      .set(authHeader(admin.token))
      .send({ status: 'PRONTA' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/service-orders/${order.body.id}/status`)
      .set(authHeader(admin.token))
      .send({ status: 'PRONTO_RETIRAR' })
      .expect(201);

    const delivered = await request(app.getHttpServer())
      .post(`/api/service-orders/${order.body.id}/status`)
      .set(authHeader(admin.token))
      .send({ status: 'ENTREGUE', note: 'Veículo entregue ao cliente.' })
      .expect(201);

    expect(delivered.body.status).toBe('ENTREGUE');
    expect(delivered.body.editable).toBe(false);

    // Financeiro: gera a conta a receber da OS e registra o pagamento total.
    const receivable = await request(app.getHttpServer())
      .post('/api/financial/sync/service-order')
      .set(authHeader(admin.token))
      .send({ serviceOrderId: order.body.id })
      .expect(201);
    expect(receivable.body.type).toBe('RECEIVABLE');
    expect(receivable.body.amount).toBe(420);
    expect(receivable.body.status).toBe('OPEN');

    const paid = await request(app.getHttpServer())
      .post(`/api/financial/entries/${receivable.body.id}/pay`)
      .set(authHeader(admin.token))
      .send({ amount: 420, method: 'PIX' })
      .expect(201);
    expect(paid.body.status).toBe('PAID');
    expect(Number(paid.body.remainingAmount)).toBe(0);

    const summary = await request(app.getHttpServer())
      .get('/api/financial/summary')
      .set(authHeader(admin.token))
      .expect(200);
    expect(Number(summary.body.receivedInPeriod)).toBeGreaterThanOrEqual(420);

    // Ledger imutável: emissão (+) e baixa (-) zeram o saldo do lançamento.
    const ledger = await request(app.getHttpServer())
      .get(`/api/financial/entries/${receivable.body.id}/ledger`)
      .set(authHeader(admin.token))
      .expect(200);
    const kinds = ledger.body.map((l: { kind: string }) => l.kind);
    expect(kinds).toContain('ISSUE');
    expect(kinds).toContain('PAYMENT');
    const ledgerSum = ledger.body.reduce((acc: number, l: { amount: number }) => acc + l.amount, 0);
    expect(Math.round(ledgerSum * 100) / 100).toBe(0);

    await request(app.getHttpServer())
      .patch(`/api/service-orders/${order.body.id}/diagnosis`)
      .set(authHeader(admin.token))
      .send({ diagnosis: 'Tentativa após entrega.' })
      .expect(422);
  });
});
