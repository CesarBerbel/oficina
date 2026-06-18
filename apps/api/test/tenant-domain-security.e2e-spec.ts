import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './support/e2e-app';
import { resetAndSeed } from './support/e2e-db';
import { authHeader, loginAs } from './support/e2e-http';

/**
 * Segurança da resolução por domínio próprio com verificação EXIGIDA (simula
 * produção via TENANT_DOMAIN_REQUIRE_VERIFIED=true): só domínio verificado
 * resolve, e um X-Forwarded-Host forjado não serve a oficina.
 */
describe('TenantDomain: verificação exigida e anti-spoof (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.TENANT_DOMAIN_REQUIRE_VERIFIED = 'true';
    app = await createE2eApp();
  });

  beforeEach(async () => {
    await resetAndSeed();
  });

  afterAll(async () => {
    delete process.env.TENANT_DOMAIN_REQUIRE_VERIFIED;
    await app?.close();
  });

  it('domínio não verificado não resolve; após verificar, resolve', async () => {
    const admin = await loginAs(app);
    const created = await request(app.getHttpServer())
      .post('/api/tenant-domains')
      .set(authHeader(admin.token))
      .send({ domain: 'oficina-modelo-prod-e2e.com.br' })
      .expect(201);
    expect(created.body.verified).toBe(false);

    // Não verificado → não resolve (404), mesmo com o host correto.
    await request(app.getHttpServer())
      .get('/api/public/site')
      .set('X-Forwarded-Host', 'oficina-modelo-prod-e2e.com.br')
      .expect(404);

    // Verifica e então resolve.
    await request(app.getHttpServer())
      .post(`/api/tenant-domains/${created.body.id}/verify`)
      .set(authHeader(admin.token))
      .expect(201);

    const resolved = await request(app.getHttpServer())
      .get('/api/public/site')
      .set('X-Forwarded-Host', 'oficina-modelo-prod-e2e.com.br')
      .expect(200);
    expect(resolved.body.settings.shopName).toBe('Oficina Modelo');
  });

  it('X-Forwarded-Host forjado (host não cadastrado) não serve nenhuma oficina', async () => {
    await request(app.getHttpServer())
      .get('/api/public/site')
      .set('X-Forwarded-Host', 'host-forjado-e2e.com')
      .expect(404);
  });
});
