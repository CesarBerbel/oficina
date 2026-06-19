import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './support/e2e-app';
import { prisma, resetAndSeed } from './support/e2e-db';
import { authHeader, loginAs } from './support/e2e-http';

describe('Sessões ativas da plataforma (e2e)', () => {
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

  async function platformLogin() {
    await prisma.user.updateMany({
      where: { email: 'admin@oficina.local' },
      data: { superAdmin: true },
    });
    return loginAs(app);
  }

  it('super admin lista sessões ativas de todas as oficinas', async () => {
    const platform = await platformLogin();
    await loginAs(app, { email: 'atendente@oficina.local' });
    await loginAs(app, {
      tenantSlug: 'oficina-concorrente',
      email: 'admin@concorrente.local',
    });

    const res = await request(app.getHttpServer())
      .get('/api/platform/sessions')
      .set(authHeader(platform.token))
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(3);

    const emails = (res.body as Array<{ userEmail: string }>).map((session) => session.userEmail);
    expect(emails).toContain('admin@oficina.local');
    expect(emails).toContain('atendente@oficina.local');
    expect(emails).toContain('admin@concorrente.local');

    const adminSession = (res.body as Array<{ userEmail: string; platformAdmin: boolean }>).find(
      (session) => session.userEmail === 'admin@oficina.local',
    );
    expect(adminSession?.platformAdmin).toBe(true);
  });

  it('não exibe refresh tokens revogados como sessões ativas', async () => {
    const platform = await platformLogin();
    const atendente = await loginAs(app, { email: 'atendente@oficina.local' });

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set(authHeader(atendente.token))
      .set('Cookie', atendente.cookie)
      .expect(204);

    const res = await request(app.getHttpServer())
      .get('/api/platform/sessions')
      .set(authHeader(platform.token))
      .expect(200);

    const emails = (res.body as Array<{ userEmail: string }>).map((session) => session.userEmail);
    expect(emails).toContain('admin@oficina.local');
    expect(emails).not.toContain('atendente@oficina.local');
  });

  it('usuário comum não acessa a lista global de sessões', async () => {
    const admin = await loginAs(app);

    await request(app.getHttpServer())
      .get('/api/platform/sessions')
      .set(authHeader(admin.token))
      .expect(403);
  });
});
