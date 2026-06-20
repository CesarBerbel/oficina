import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './support/e2e-app';
import { prisma, resetAndSeed } from './support/e2e-db';
import { authHeader, loginAs } from './support/e2e-http';

type OrderItemKind = 'SERVICE' | 'PART';

interface OrderItemBody {
  id: string;
  kind: OrderItemKind;
  description: string;
  total: number;
}

interface OrderBody {
  id: string;
  publicToken: string;
  items: OrderItemBody[];
  totalServices: number;
  totalParts: number;
  total: number;
}

interface QuoteItemBody {
  id: string;
  serviceOrderItemId: string | null;
  kind: OrderItemKind;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
}

interface QuoteBody {
  id: string;
  status: string;
  token: string;
  totalServices: number;
  totalParts: number;
  discount: number;
  total: number;
  decisionType: string | null;
  items: QuoteItemBody[];
}

interface ReadyOrderFixture {
  order: OrderBody;
  serviceItemId: string;
  partItemId: string;
}

function findItem(items: OrderItemBody[], kind: OrderItemKind, description: string): OrderItemBody {
  const item = items.find((row) => row.kind === kind && row.description === description);
  if (!item) throw new Error(`Item ${kind}/${description} não encontrado na OS`);
  return item;
}

function findQuoteItem(items: QuoteItemBody[], serviceOrderItemId: string): QuoteItemBody {
  const item = items.find((row) => row.serviceOrderItemId === serviceOrderItemId);
  if (!item) throw new Error(`Item de orçamento da OS ${serviceOrderItemId} não encontrado`);
  return item;
}

describe('Orçamento: desconto por item e expiração de link público (e2e)', () => {
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

  async function createReadyOrder(token: string): Promise<ReadyOrderFixture> {
    const customer = await request(app.getHttpServer())
      .post('/api/customers')
      .set(authHeader(token))
      .send({
        type: 'PF',
        name: 'Cliente Desconto E2E',
        document: '52998224725',
        phone: '11977770000',
        whatsapp: '11977770000',
        email: 'cliente.desconto@example.com',
        city: 'São Paulo',
        state: 'SP',
      })
      .expect(201);

    const vehicle = await request(app.getHttpServer())
      .post('/api/vehicles')
      .set(authHeader(token))
      .send({
        customerId: customer.body.id,
        plate: 'DSC1A23',
        manufacturer: 'Fiat',
        model: 'Argo',
        modelYear: 2021,
        fuel: 'FLEX',
        currentKm: 42000,
      })
      .expect(201);

    const orderResponse = await request(app.getHttpServer())
      .post('/api/service-orders')
      .set(authHeader(token))
      .send({
        customerId: customer.body.id,
        vehicleId: vehicle.body.id,
        reportedProblem: 'Cliente solicita revisão e troca de filtro.',
      })
      .expect(201);
    const order = orderResponse.body as OrderBody;

    const afterService = await request(app.getHttpServer())
      .post(`/api/service-orders/${order.id}/items`)
      .set(authHeader(token))
      .send({
        kind: 'SERVICE',
        description: 'Diagnóstico eletrônico com revisão',
        quantity: 1,
        unitPrice: 200,
      })
      .expect(201);
    const serviceItem = findItem(
      (afterService.body as OrderBody).items,
      'SERVICE',
      'Diagnóstico eletrônico com revisão',
    );

    const afterPart = await request(app.getHttpServer())
      .post(`/api/service-orders/${order.id}/items`)
      .set(authHeader(token))
      .send({
        kind: 'PART',
        description: 'Filtro de ar do motor',
        quantity: 1,
        unitPrice: 100,
      })
      .expect(201);
    const partItem = findItem((afterPart.body as OrderBody).items, 'PART', 'Filtro de ar do motor');

    await request(app.getHttpServer())
      .patch(`/api/service-orders/${order.id}/diagnosis`)
      .set(authHeader(token))
      .send({ diagnosis: 'Filtro saturado e necessidade de revisão preventiva.' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/service-orders/${order.id}/status`)
      .set(authHeader(token))
      .send({ status: 'DIAGNOSTICO_PRONTO', note: 'Diagnóstico validado.' })
      .expect(201);

    return { order, serviceItemId: serviceItem.id, partItemId: partItem.id };
  }

  it('gera desconto por item e recalcula aprovação parcial', async () => {
    const admin = await loginAs(app);
    const fixture = await createReadyOrder(admin.token);

    const quoteResponse = await request(app.getHttpServer())
      .post(`/api/service-orders/${fixture.order.id}/quote`)
      .set(authHeader(admin.token))
      .send({
        publicNotes: 'Descontos aplicados diretamente nos itens do orçamento.',
        itemDiscounts: [
          { serviceOrderItemId: fixture.serviceItemId, discountPercent: 10 },
          { serviceOrderItemId: fixture.partItemId, discountPercent: 20 },
        ],
      })
      .expect(201);
    const quote = quoteResponse.body as QuoteBody;

    expect(quote.status).toBe('ENVIADO');
    expect(quote.totalServices).toBe(180);
    expect(quote.totalParts).toBe(80);
    expect(quote.discount).toBe(0);
    expect(quote.total).toBe(260);

    const serviceQuoteItem = findQuoteItem(quote.items, fixture.serviceItemId);
    const partQuoteItem = findQuoteItem(quote.items, fixture.partItemId);
    expect(serviceQuoteItem).toMatchObject({
      discountPercent: 10,
      discountAmount: 20,
      total: 180,
    });
    expect(partQuoteItem).toMatchObject({
      discountPercent: 20,
      discountAmount: 20,
      total: 80,
    });

    const tracking = await request(app.getHttpServer())
      .get(`/api/public/track/${fixture.order.publicToken}`)
      .expect(200);
    expect(tracking.body.quote.total).toBe(260);
    expect(tracking.body.quote.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          serviceOrderItemId: fixture.serviceItemId,
          discountPercent: 10,
          discountAmount: 20,
          total: 180,
        }),
        expect.objectContaining({
          serviceOrderItemId: fixture.partItemId,
          discountPercent: 20,
          discountAmount: 20,
          total: 80,
        }),
      ]),
    );

    const decided = await request(app.getHttpServer())
      .post(`/api/public/track/${fixture.order.publicToken}/quote-decision`)
      .send({
        reject: false,
        itemDecisions: [{ itemId: partQuoteItem.id, decision: 'RECUSADO' }],
        signatureName: 'Cliente Desconto E2E',
        signatureDoc: '52998224725',
      })
      .expect(201);
    expect(decided.body.status).toBe('APROVADO_PARCIAL');
    expect(decided.body.decisionType).toBe('PARCIAL');

    const approvedOrder = await request(app.getHttpServer())
      .get(`/api/service-orders/${fixture.order.id}`)
      .set(authHeader(admin.token))
      .expect(200);
    expect(approvedOrder.body.status).toBe('ORCAMENTO_APROVADO');
    expect(approvedOrder.body.totalServices).toBe(180);
    expect(approvedOrder.body.totalParts).toBe(0);
    expect(approvedOrder.body.total).toBe(180);
    expect((approvedOrder.body.items as OrderItemBody[]).map((item) => item.id)).toEqual([
      fixture.serviceItemId,
    ]);
  });

  it('rejeita desconto maior que 100% e desconto apontando para item inexistente', async () => {
    const admin = await loginAs(app);
    const fixture = await createReadyOrder(admin.token);

    await request(app.getHttpServer())
      .post(`/api/service-orders/${fixture.order.id}/quote`)
      .set(authHeader(admin.token))
      .send({
        itemDiscounts: [{ serviceOrderItemId: fixture.serviceItemId, discountPercent: 100.01 }],
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/service-orders/${fixture.order.id}/quote`)
      .set(authHeader(admin.token))
      .send({
        itemDiscounts: [{ serviceOrderItemId: 'item-inexistente', discountPercent: 10 }],
      })
      .expect(400);
  });

  it('bloqueia acompanhamento e decisão quando o token público está expirado', async () => {
    const admin = await loginAs(app);
    const fixture = await createReadyOrder(admin.token);

    await request(app.getHttpServer())
      .post(`/api/service-orders/${fixture.order.id}/quote`)
      .set(authHeader(admin.token))
      .send({ publicNotes: 'Orçamento que será expirado no teste.' })
      .expect(201);

    await prisma.serviceOrder.update({
      where: { id: fixture.order.id },
      data: { publicTokenExpiresAt: new Date(Date.now() - 60_000) },
    });

    await request(app.getHttpServer())
      .get(`/api/public/track/${fixture.order.publicToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/public/track/${fixture.order.publicToken}/quote-decision`)
      .send({
        reject: false,
        itemDecisions: [],
        signatureName: 'Cliente Desconto E2E',
        signatureDoc: '52998224725',
      })
      .expect(404);
  });
});
