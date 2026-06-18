import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './support/e2e-app';
import { prisma, resetAndSeed } from './support/e2e-db';
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
    process.env.PUBLIC_STRICT_HOST = 'true';
    app = await createE2eApp();
  });

  beforeEach(async () => {
    await resetAndSeed();
  });

  afterAll(async () => {
    delete process.env.TENANT_DOMAIN_REQUIRE_VERIFIED;
    delete process.env.PUBLIC_STRICT_HOST;
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

    // Marca como verificado (a verificação real é por DNS; aqui simulamos a
    // posse comprovada) e então resolve.
    await prisma.tenantDomain.update({
      where: { id: created.body.id },
      data: { verifiedAt: new Date() },
    });

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

  it('em modo estrito, ?tenantSlug= e x-public-* são ignorados; só by-slug funciona', async () => {
    // Override por query é ignorado → ambíguo (2 sites publicados) → 404.
    await request(app.getHttpServer())
      .get('/api/public/site?tenantSlug=oficina-modelo')
      .expect(404);

    // Override por header x-public-tenant-slug também ignorado → 404.
    await request(app.getHttpServer())
      .get('/api/public/site')
      .set('X-Public-Tenant-Slug', 'oficina-modelo')
      .expect(404);

    // A rota explícita por slug continua funcionando (uso intencional).
    const bySlug = await request(app.getHttpServer())
      .get('/api/public/site/by-slug/oficina-modelo')
      .expect(200);
    expect(bySlug.body.settings.shopName).toBe('Oficina Modelo');
  });
});
