import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './support/e2e-app';
import { prisma, resetAndSeed } from './support/e2e-db';
import { authHeader, loginAs } from './support/e2e-http';

/**
 * Painel da plataforma (Fase 1, PR 5): super admin lista pedidos, aprova
 * (provisiona a conta), recusa, e suspende/reativa contas.
 */
describe('Gestão de contas pela plataforma (e2e)', () => {
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

  async function platformToken(): Promise<string> {
    await prisma.user.updateMany({
      where: { email: 'admin@oficina.local' },
      data: { superAdmin: true },
    });
    return (await loginAs(app)).token;
  }

  async function makeRequest(slug: string): Promise<string> {
    const r = await prisma.accountRequest.create({
      data: { name: `Oficina ${slug}`, slug, contactName: 'Dono', email: `dono@${slug}.com` },
    });
    return r.id;
  }

  it('aprovar um pedido provisiona a conta e o novo admin loga', async () => {
    const token = await platformToken();
    const reqId = await makeRequest('pedido-um');

    const list = await request(app.getHttpServer())
      .get('/api/platform/accounts/requests?status=PENDING')
      .set(authHeader(token))
      .expect(200);
    expect(list.body.some((r: { id: string }) => r.id === reqId)).toBe(true);

    const approved = await request(app.getHttpServer())
      .post(`/api/platform/accounts/requests/${reqId}/approve`)
      .set(authHeader(token))
      .expect(201);
    expect(approved.body.account.slug).toBe('pedido-um');
    const tempPassword = approved.body.tempPassword as string;

    // Pedido marcado como aprovado e conta criada.
    const req = await prisma.accountRequest.findUniqueOrThrow({ where: { id: reqId } });
    expect(req.status).toBe('APPROVED');
    const accounts = await request(app.getHttpServer())
      .get('/api/platform/accounts')
      .set(authHeader(token))
      .expect(200);
    expect(accounts.body.some((a: { slug: string }) => a.slug === 'pedido-um')).toBe(true);

    // O novo admin loga (por slug) com a senha temporária.
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ tenantSlug: 'pedido-um', email: 'dono@pedido-um.com', password: tempPassword })
      .expect(200);
    expect(login.body.user.forcePasswordChange).toBe(true);
  });

  it('recusar um pedido o tira da lista de pendentes', async () => {
    const token = await platformToken();
    const reqId = await makeRequest('pedido-rejeitado');

    await request(app.getHttpServer())
      .post(`/api/platform/accounts/requests/${reqId}/reject`)
      .set(authHeader(token))
      .expect(201);

    const list = await request(app.getHttpServer())
      .get('/api/platform/accounts/requests?status=PENDING')
      .set(authHeader(token))
      .expect(200);
    expect(list.body.some((r: { id: string }) => r.id === reqId)).toBe(false);
  });

  it('suspende e reativa uma conta', async () => {
    const token = await platformToken();
    const account = await prisma.account.findFirstOrThrow({ where: { slug: 'oficina-modelo' } });

    const suspended = await request(app.getHttpServer())
      .patch(`/api/platform/accounts/${account.id}/status`)
      .set(authHeader(token))
      .send({ status: 'SUSPENDED' })
      .expect(200);
    expect(suspended.body.status).toBe('SUSPENDED');

    const reactivated = await request(app.getHttpServer())
      .patch(`/api/platform/accounts/${account.id}/status`)
      .set(authHeader(token))
      .send({ status: 'ACTIVE' })
      .expect(200);
    expect(reactivated.body.status).toBe('ACTIVE');
  });

  it('nega acesso a quem não é platform admin (403)', async () => {
    const admin = await loginAs(app); // sem promover
    await request(app.getHttpServer())
      .get('/api/platform/accounts')
      .set(authHeader(admin.token))
      .expect(403);
  });
});
