import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './support/e2e-app';
import { prisma, resetAndSeed, TENANT_SLUG } from './support/e2e-db';

/**
 * Pedido público de criação de conta (Fase 1, PR 4): a landing envia o pedido,
 * que fica PENDING até o platform admin aprovar.
 */
describe('Pedido de conta (e2e)', () => {
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

  const body = (slug: string) => ({
    name: 'Auto Center Teste',
    slug,
    contactName: 'Fulano',
    email: 'fulano@x.com',
    phone: '11999990000',
  });

  it('cria um pedido PENDING', async () => {
    await request(app.getHttpServer())
      .post('/api/public/account-request')
      .send(body('nova-oficina'))
      .expect(201);

    const req = await prisma.accountRequest.findFirst({ where: { slug: 'nova-oficina' } });
    expect(req?.status).toBe('PENDING');
    expect(req?.email).toBe('fulano@x.com');
  });

  it('rejeita subdomínio reservado (400)', async () => {
    await request(app.getHttpServer())
      .post('/api/public/account-request')
      .send(body('app'))
      .expect(400);
  });

  it('rejeita identificador já em uso por uma conta (409)', async () => {
    await request(app.getHttpServer())
      .post('/api/public/account-request')
      .send(body(TENANT_SLUG))
      .expect(409);
  });

  it('rejeita pedido duplicado para o mesmo identificador (409)', async () => {
    await request(app.getHttpServer())
      .post('/api/public/account-request')
      .send(body('duplicada'))
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/public/account-request')
      .send(body('duplicada'))
      .expect(409);
  });
});
