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
      data: { verifiedAt: new Date(), status: 'VERIFIED' },
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

  it('lead público ignora ?tenantSlug= em modo estrito; só resolve por host', async () => {
    const lead = { name: 'Cliente E2E', phone: '11999998888', message: 'Quero um orçamento' };

    // Override por query ignorado e sem host resolvível → 400.
    await request(app.getHttpServer())
      .post('/api/public/lead?tenantSlug=oficina-modelo')
      .send(lead)
      .expect(400);

    // Com host de domínio verificado, registra o lead na oficina certa.
    const modelo = await prisma.tenant.findUniqueOrThrow({ where: { slug: 'oficina-modelo' } });
    await prisma.tenantDomain.create({
      data: {
        tenantId: modelo.id,
        domain: 'lead-host-e2e.com.br',
        verificationToken: 'tok-lead',
        verifiedAt: new Date(),
        status: 'VERIFIED',
        isPrimary: true,
      },
    });
    await request(app.getHttpServer())
      .post('/api/public/lead')
      .set('X-Forwarded-Host', 'lead-host-e2e.com.br')
      .send(lead)
      .expect(201);
    const count = await prisma.lead.count({ where: { tenantId: modelo.id } });
    expect(count).toBe(1);
  });

  it('SSR multi-domínio: cada X-Forwarded-Host resolve a oficina correta', async () => {
    const modelo = await prisma.tenant.findUniqueOrThrow({ where: { slug: 'oficina-modelo' } });
    const concorrente = await prisma.tenant.findUniqueOrThrow({
      where: { slug: 'oficina-concorrente' },
    });
    await prisma.tenantDomain.createMany({
      data: [
        {
          tenantId: modelo.id,
          domain: 'modelo-e2e.com.br',
          verificationToken: 'tk-a',
          verifiedAt: new Date(),
          status: 'VERIFIED',
          isPrimary: true,
        },
        {
          tenantId: concorrente.id,
          domain: 'concorrente-e2e.com.br',
          verificationToken: 'tk-b',
          verifiedAt: new Date(),
          status: 'VERIFIED',
          isPrimary: true,
        },
      ],
    });

    // Simula a chamada do SSR (web→api) repassando o host real de cada domínio.
    const a = await request(app.getHttpServer())
      .get('/api/public/site')
      .set('X-Forwarded-Host', 'modelo-e2e.com.br')
      .expect(200);
    expect(a.body.settings.shopName).toBe('Oficina Modelo');

    const b = await request(app.getHttpServer())
      .get('/api/public/site')
      .set('X-Forwarded-Host', 'concorrente-e2e.com.br')
      .expect(200);
    expect(b.body.settings.shopName).toBe('Oficina Concorrente');
  });
});
