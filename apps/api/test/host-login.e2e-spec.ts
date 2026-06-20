import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MailService } from '../src/infra/mail/mail.service';
import { createE2eApp } from './support/e2e-app';
import { createBranchTenant, prisma, resetAndSeed, TEST_PASSWORD } from './support/e2e-db';

const HOST = 'modelo.saecbpa.test';

/**
 * Login escopado pelo host (Fase 1, PR 3): em um subdomínio próprio a conta vem
 * do host (sem digitar slug), só usuários daquela conta autenticam, e o refresh
 * confia na origem do próprio host.
 */
describe('Login por subdomínio (host → conta) (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createE2eApp();
  });

  beforeEach(async () => {
    await resetAndSeed();
    const matriz = await prisma.tenant.findUniqueOrThrow({
      where: { slug: 'oficina-modelo' },
      select: { id: true },
    });
    await prisma.tenantDomain.create({
      data: {
        tenantId: matriz.id,
        domain: HOST,
        verificationToken: 'tok-host',
        verifiedAt: new Date(),
        status: 'VERIFIED',
        isPrimary: true,
      },
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /auth/context resolve a conta pelo host (e null em host desconhecido)', async () => {
    const ctx = await request(app.getHttpServer())
      .get('/api/auth/context')
      .set('X-Forwarded-Host', HOST)
      .expect(200);
    expect(ctx.body.account).toMatchObject({ name: 'Oficina Modelo', slug: 'oficina-modelo' });
    expect(ctx.body.tenantSlug).toBe('oficina-modelo');
    expect(ctx.body.account.branches).toEqual(
      expect.arrayContaining([{ name: 'Oficina Modelo', slug: 'oficina-modelo' }]),
    );

    const none = await request(app.getHttpServer())
      .get('/api/auth/context')
      .set('X-Forwarded-Host', 'desconhecido.saecbpa.test')
      .expect(200);
    expect(none.body.account).toBeNull();
  });

  it('login no subdomínio funciona SEM slug; sem host nem slug, falha', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-Host', HOST)
      .send({ email: 'admin@oficina.local', password: TEST_PASSWORD })
      .expect(200);

    // Sem host resolvível e sem slug → não há como achar a conta.
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@oficina.local', password: TEST_PASSWORD })
      .expect(401);
  });

  it('isolamento: usuário de outra conta não loga pelo host desta conta', async () => {
    const other = await prisma.user.findFirstOrThrow({
      where: { tenant: { slug: 'oficina-concorrente' }, role: 'ADMIN', superAdmin: false },
      select: { email: true },
    });
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-Host', HOST)
      .send({ email: other.email, password: TEST_PASSWORD })
      .expect(401);
  });

  it('login multi-filial permite escolher filial pelo slug', async () => {
    const matriz = await prisma.tenant.findUniqueOrThrow({
      where: { slug: 'oficina-modelo' },
      select: { id: true },
    });
    const filial = await createBranchTenant(matriz.id, {
      slug: 'oficina-modelo-filial-e2e',
      name: 'Oficina Modelo Filial E2E',
      adminEmail: 'admin@oficina.local',
    });

    const ctx = await request(app.getHttpServer())
      .get('/api/auth/context')
      .set('X-Forwarded-Host', HOST)
      .expect(200);
    expect(ctx.body.account.branches).toEqual(
      expect.arrayContaining([
        { name: 'Oficina Modelo', slug: 'oficina-modelo' },
        { name: 'Oficina Modelo Filial E2E', slug: filial.slug },
      ]),
    );

    const matrizLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-Host', HOST)
      .send({ email: 'admin@oficina.local', password: TEST_PASSWORD })
      .expect(200);
    expect(matrizLogin.body.user.tenantId).toBe(matriz.id);

    const filialLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-Host', HOST)
      .send({
        tenantSlug: filial.slug,
        email: 'admin@oficina.local',
        password: TEST_PASSWORD,
      })
      .expect(200);
    expect(filialLogin.body.user.tenantId).toBe(filial.id);
  });

  it('reset de senha monta link usando o domínio confiável da requisição', async () => {
    const mail = app.get(MailService);
    const sendSpy = jest.spyOn(mail, 'send').mockResolvedValue({
      ok: false,
      skipped: true,
      error: null,
    });

    await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .set('X-Forwarded-Host', HOST)
      .set('X-Forwarded-Proto', 'https')
      .send({ email: 'admin@oficina.local' })
      .expect(200);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const sent = sendSpy.mock.calls[0]?.[0];
    expect(sent?.text).toContain(`https://${HOST}/redefinir-senha?token=`);
    sendSpy.mockRestore();
  });

  it('refresh confia na origem do próprio host e barra origem estranha', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-Host', HOST)
      .send({ email: 'admin@oficina.local', password: TEST_PASSWORD })
      .expect(200);
    const cookie = login.headers['set-cookie'];

    // Mesma origem do host → ok.
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('X-Forwarded-Host', HOST)
      .set('Origin', `https://${HOST}`)
      .set('Cookie', cookie)
      .expect(200);

    // Origem estranha → barrada (CSRF).
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('X-Forwarded-Host', HOST)
      .set('Origin', 'https://evil.example.com')
      .set('Cookie', cookie)
      .expect(403);
  });
});
