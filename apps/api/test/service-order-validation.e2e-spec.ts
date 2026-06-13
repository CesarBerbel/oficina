import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './support/e2e-app';
import { prisma, resetAndSeed } from './support/e2e-db';
import { authHeader, loginAs } from './support/e2e-http';

describe('Validações de OS e máquina de estados (e2e)', () => {
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

  async function createOrder(token: string, plate = 'STM1A23') {
    const customer = await request(app.getHttpServer())
      .post('/api/customers')
      .set(authHeader(token))
      .send({ name: 'Cliente Máquina de Estados', phone: '11911112222' })
      .expect(201);

    const vehicle = await request(app.getHttpServer())
      .post('/api/vehicles')
      .set(authHeader(token))
      .send({
        customerId: customer.body.id,
        plate,
        manufacturer: 'Fiat',
        model: 'Argo',
        modelYear: 2020,
      })
      .expect(201);

    const order = await request(app.getHttpServer())
      .post('/api/service-orders')
      .set(authHeader(token))
      .send({
        customerId: customer.body.id,
        vehicleId: vehicle.body.id,
        reportedProblem: 'Motor falhando em marcha lenta.',
      })
      .expect(201);

    return order.body;
  }

  it('exige diagnóstico antes de concluir diagnóstico pronto', async () => {
    const admin = await loginAs(app);
    const order = await createOrder(admin.token);

    await request(app.getHttpServer())
      .post(`/api/service-orders/${order.id}/status`)
      .set(authHeader(admin.token))
      .send({ status: 'DIAGNOSTICO_PRONTO' })
      .expect(422);

    await request(app.getHttpServer())
      .patch(`/api/service-orders/${order.id}/diagnosis`)
      .set(authHeader(admin.token))
      .send({ diagnosis: 'Falha de ignição no cilindro 2.' })
      .expect(200);

    const updated = await request(app.getHttpServer())
      .post(`/api/service-orders/${order.id}/status`)
      .set(authHeader(admin.token))
      .send({ status: 'DIAGNOSTICO_PRONTO' })
      .expect(201);

    expect(updated.body.status).toBe('DIAGNOSTICO_PRONTO');
  });

  it('bloqueia transições inválidas da máquina de estados', async () => {
    const admin = await loginAs(app);
    const order = await createOrder(admin.token);

    await request(app.getHttpServer())
      .post(`/api/service-orders/${order.id}/status`)
      .set(authHeader(admin.token))
      .send({ status: 'EM_EXECUCAO' })
      .expect(422);

    await request(app.getHttpServer())
      .patch(`/api/service-orders/${order.id}/diagnosis`)
      .set(authHeader(admin.token))
      .send({ diagnosis: 'Necessária limpeza de bicos.' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/service-orders/${order.id}/status`)
      .set(authHeader(admin.token))
      .send({ status: 'DIAGNOSTICO_PRONTO' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/service-orders/${order.id}/status`)
      .set(authHeader(admin.token))
      .send({ status: 'ENTREGUE' })
      .expect(422);
  });

  it('expõe transições disponíveis com guardas da máquina de estados', async () => {
    const admin = await loginAs(app);
    const order = await createOrder(admin.token);

    expect(order.availableTransitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'DIAGNOSTICO_PRONTO',
          disabledReason: expect.stringContaining('diagnóstico técnico'),
        }),
        expect.objectContaining({ status: 'CANCELADA', disabledReason: null }),
      ]),
    );

    const transitions = await request(app.getHttpServer())
      .get(`/api/service-orders/${order.id}/transitions`)
      .set(authHeader(admin.token))
      .expect(200);

    expect(transitions.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'DIAGNOSTICO_PRONTO' }),
        expect.objectContaining({ status: 'CANCELADA' }),
      ]),
    );

    await request(app.getHttpServer())
      .patch(`/api/service-orders/${order.id}/diagnosis`)
      .set(authHeader(admin.token))
      .send({ diagnosis: 'Falha de ignição corrigível.' })
      .expect(200);

    const readyTransitions = await request(app.getHttpServer())
      .get(`/api/service-orders/${order.id}/transitions`)
      .set(authHeader(admin.token))
      .expect(200);

    expect(
      readyTransitions.body.find(
        (item: { status: string }) => item.status === 'DIAGNOSTICO_PRONTO',
      ),
    ).toMatchObject({ disabledReason: null });
  });

  it('bloqueia transições sistêmicas que devem ocorrer pelo fluxo correto', async () => {
    const admin = await loginAs(app);
    const order = await createOrder(admin.token);

    await request(app.getHttpServer())
      .patch(`/api/service-orders/${order.id}/diagnosis`)
      .set(authHeader(admin.token))
      .send({ diagnosis: 'Diagnóstico técnico preenchido.' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/service-orders/${order.id}/status`)
      .set(authHeader(admin.token))
      .send({ status: 'DIAGNOSTICO_PRONTO' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/service-orders/${order.id}/status`)
      .set(authHeader(admin.token))
      .send({ status: 'ORCAMENTO' })
      .expect(422);
  });


  it('não mostra OS canceladas, entregues ou recusadas no kanban técnico', async () => {
    const admin = await loginAs(app);
    const activeOrder = await createOrder(admin.token, 'KBN1A01');
    const canceledOrder = await createOrder(admin.token, 'KBN1A02');
    const refusedOrder = await createOrder(admin.token, 'KBN1A03');
    const deliveredOrder = await createOrder(admin.token, 'KBN1A04');

    await prisma.serviceOrder.update({
      where: { id: canceledOrder.id },
      data: { status: 'CANCELADA' },
    });
    await prisma.serviceOrder.update({
      where: { id: refusedOrder.id },
      data: { status: 'ORCAMENTO_RECUSADO' },
    });
    await prisma.serviceOrder.update({
      where: { id: deliveredOrder.id },
      data: { status: 'ENTREGUE' },
    });

    const board = await request(app.getHttpServer())
      .get('/api/service-orders/board')
      .set(authHeader(admin.token))
      .expect(200);

    const allBoardIds = Object.values(
      board.body as Record<string, Array<{ id: string }>>,
    )
      .flat()
      .map((order) => order.id);

    expect(allBoardIds).toContain(activeOrder.id);
    expect(allBoardIds).not.toContain(canceledOrder.id);
    expect(allBoardIds).not.toContain(refusedOrder.id);
    expect(allBoardIds).not.toContain(deliveredOrder.id);
    expect(board.body.ORCAMENTO_RECUSADO).toBeUndefined();
    expect(board.body.CANCELADA).toBeUndefined();
    expect(board.body.ENTREGUE).toBeUndefined();
  });

});
