import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './support/e2e-app';
import { prisma, resetAndSeed, type SeedData } from './support/e2e-db';
import { authHeader, loginAs } from './support/e2e-http';
import { OutboxService } from '@/modules/outbox/outbox.service';

/**
 * Outbox transacional: abrir uma OS grava o evento de mensagem na mesma
 * transação (PENDING) e o processamento despacha e marca como DONE.
 */
describe('Outbox de mensagens (e2e)', () => {
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

  it('abrir OS enfileira ORDER_EVENT no outbox e o processamento marca DONE', async () => {
    const admin = await loginAs(app);

    const customer = await request(app.getHttpServer())
      .post('/api/customers')
      .set(authHeader(admin.token))
      .send({ type: 'PF', name: 'Cliente Outbox' })
      .expect(201);

    const vehicle = await request(app.getHttpServer())
      .post('/api/vehicles')
      .set(authHeader(admin.token))
      .send({
        customerId: customer.body.id,
        plate: 'OBX1A23',
        manufacturer: 'Volkswagen',
        model: 'Gol',
        modelYear: 2020,
        fuel: 'FLEX',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/service-orders')
      .set(authHeader(admin.token))
      .send({
        customerId: customer.body.id,
        vehicleId: vehicle.body.id,
        reportedProblem: 'Teste do outbox',
      })
      .expect(201);

    // Evento enfileirado (atômico com a criação da OS).
    const pending = await prisma.outboxMessage.findMany({
      where: { tenantId: seed.tenant.id, status: 'PENDING' },
    });
    const event = pending.find((m) => m.type === 'ORDER_EVENT');
    expect(event).toBeDefined();
    expect((event!.payload as { event: string }).event).toBe('OS_OPENED');

    // Processa o outbox e confirma a baixa.
    const outbox = app.get(OutboxService);
    const result = await outbox.processPending();
    expect(result.done).toBeGreaterThanOrEqual(1);

    const processed = await prisma.outboxMessage.findUniqueOrThrow({
      where: { id: event!.id },
    });
    expect(processed.status).toBe('DONE');
    expect(processed.processedAt).not.toBeNull();
  });

  it('processPending é idempotente quando não há pendências', async () => {
    const outbox = app.get(OutboxService);
    const result = await outbox.processPending();
    expect(result).toEqual({ done: 0, failed: 0, retried: 0 });
  });
});
