import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './support/e2e-app';
import { resetAndSeed } from './support/e2e-db';
import { authHeader, loginAs } from './support/e2e-http';

/**
 * Gestão de oficinas (matriz/filial) pela própria conta: o admin geral (ADMIN na
 * matriz) lista, cria filial (com admin próprio + senha temporária) e renomeia;
 * a matriz continua matriz. Usuário comum não pode gerenciar.
 */
describe('Gestão de oficinas pela conta (e2e)', () => {
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

  it('admin geral lista oficinas, cria filial e renomeia a matriz', async () => {
    const admin = await loginAs(app);

    const listRes = await request(app.getHttpServer())
      .get('/api/account/tenants')
      .set(authHeader(admin.token))
      .expect(200);
    const matriz = (listRes.body as Array<{ id: string; isMatriz: boolean }>).find(
      (t) => t.isMatriz,
    );
    expect(matriz).toBeTruthy();

    const created = await request(app.getHttpServer())
      .post('/api/account/tenants')
      .set(authHeader(admin.token))
      .send({
        shopName: 'Filial Centro',
        slug: 'filial-centro-e2e',
        adminName: 'Admin Filial',
        adminEmail: 'filial-e2e@example.com',
      })
      .expect(201);
    expect(created.body.tenant.isMatriz).toBe(false);
    expect(typeof created.body.tempPassword).toBe('string');
    expect(created.body.tempPassword.length).toBeGreaterThan(8);

    const renamed = await request(app.getHttpServer())
      .patch(`/api/account/tenants/${matriz!.id}`)
      .set(authHeader(admin.token))
      .send({ name: 'Automecband', slug: 'automecband-e2e' })
      .expect(200);
    expect(renamed.body.name).toBe('Automecband');
    // A matriz continua sendo matriz mesmo após renomear.
    expect(renamed.body.isMatriz).toBe(true);
  });

  it('usuário comum (não admin geral) não cria filial', async () => {
    const atendente = await loginAs(app, { email: 'atendente@oficina.local' });
    await request(app.getHttpServer())
      .post('/api/account/tenants')
      .set(authHeader(atendente.token))
      .send({
        shopName: 'Filial Teste',
        slug: 'filial-teste-e2e',
        adminName: 'Fulano de Tal',
        adminEmail: 'fulano-e2e@example.com',
      })
      .expect(403);
  });
});
