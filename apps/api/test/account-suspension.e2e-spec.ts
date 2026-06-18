import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './support/e2e-app';
import { prisma, resetAndSeed, TENANT_SLUG, TEST_PASSWORD } from './support/e2e-db';
import { authHeader, loginAs } from './support/e2e-http';

/**
 * Conta (Account) suspensa bloqueia o acesso dos usuários daquela conta: o token
 * existente para de valer e um novo login é recusado. (Super admin é exceção,
 * coberto pelo código; aqui o admin da oficina não é super admin.)
 */
describe('Conta suspensa bloqueia acesso (e2e)', () => {
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

  it('suspender a conta invalida o token atual e recusa novo login', async () => {
    const admin = await loginAs(app);

    // Antes: acesso normal.
    await request(app.getHttpServer()).get('/api/metrics').set(authHeader(admin.token)).expect(200);

    // Suspende a conta da oficina-modelo.
    await prisma.account.update({
      where: { slug: TENANT_SLUG },
      data: { status: 'SUSPENDED' },
    });

    // Token existente passa a ser rejeitado.
    await request(app.getHttpServer()).get('/api/metrics').set(authHeader(admin.token)).expect(401);

    // Novo login é recusado enquanto suspensa.
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ tenantSlug: TENANT_SLUG, email: 'admin@oficina.local', password: TEST_PASSWORD })
      .expect(403);

    // Reativando, volta a logar.
    await prisma.account.update({
      where: { slug: TENANT_SLUG },
      data: { status: 'ACTIVE' },
    });
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ tenantSlug: TENANT_SLUG, email: 'admin@oficina.local', password: TEST_PASSWORD })
      .expect(200);
  });
});
