import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './support/e2e-app';
import { resetAndSeed, TENANT_SLUG, TEST_PASSWORD, prisma } from './support/e2e-db';
import { authHeader, getCookie, loginAs } from './support/e2e-http';

describe('Auth e sessão (e2e)', () => {
  let app: INestApplication;
  const cookieName = process.env.AUTH_COOKIE_NAME ?? 'oficina_e2e_rt';

  beforeAll(async () => {
    app = await createE2eApp();
  });

  beforeEach(async () => {
    await resetAndSeed();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/health retorna a API e o banco como saudáveis', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);

    expect(res.body).toMatchObject({ status: 'ok', db: 'up' });
  });

  it('bloqueia rota protegida sem bearer token', async () => {
    await request(app.getHttpServer()).get('/api/customers').expect(401);
  });

  it('rejeita credenciais inválidas e registra tentativa de login falha', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        tenantSlug: TENANT_SLUG,
        email: 'admin@oficina.local',
        password: 'senha-incorreta',
      })
      .expect(401);

    const attempts = await prisma.loginAttempt.findMany({
      where: { email: 'admin@oficina.local' },
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0].success).toBe(false);
  });

  it('rejeita usuário inativo com 403', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        tenantSlug: TENANT_SLUG,
        email: 'inativo@oficina.local',
        password: TEST_PASSWORD,
      })
      .expect(403);
  });

  it('autentica, retorna permissões, rotaciona refresh token e invalida logout', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        tenantSlug: TENANT_SLUG,
        email: 'admin@oficina.local',
        password: TEST_PASSWORD,
      })
      .expect(200);

    expect(login.body.accessToken).toEqual(expect.any(String));
    expect(login.body.user).toMatchObject({
      email: 'admin@oficina.local',
      role: 'ADMIN',
    });
    expect(login.body.user.permissions).toContain('users:write');

    const firstCookie = getCookie(login.headers['set-cookie'], cookieName);

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set(authHeader(login.body.accessToken))
      .expect(200);
    expect(me.body.email).toBe('admin@oficina.local');

    const refresh = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', firstCookie)
      .expect(200);
    expect(refresh.body.accessToken).toEqual(expect.any(String));

    const secondCookie = getCookie(refresh.headers['set-cookie'], cookieName);
    expect(secondCookie).not.toBe(firstCookie);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', firstCookie)
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set(authHeader(refresh.body.accessToken))
      .set('Cookie', secondCookie)
      .expect(204);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', secondCookie)
      .expect(401);
  });

  it('mantém /api/auth/me consistente com o usuário autenticado', async () => {
    const session = await loginAs(app);

    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set(authHeader(session.token))
      .expect(200);

    expect(res.body).toMatchObject({
      email: 'admin@oficina.local',
      role: 'ADMIN',
    });
    expect(Array.isArray(res.body.permissions)).toBe(true);
  });
});
