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

  it('usuário lista suas sessões e faz logout global', async () => {
    const admin = await loginAs(app);
    await loginAs(app);

    const list = await request(app.getHttpServer())
      .get('/api/auth/sessions')
      .set(authHeader(admin.token))
      .set('Cookie', admin.cookie)
      .expect(200);

    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.some((s: { current: boolean }) => s.current)).toBe(true);

    await request(app.getHttpServer())
      .post('/api/auth/logout-all')
      .set(authHeader(admin.token))
      .set('Cookie', admin.cookie)
      .expect(204);

    const active = await prisma.refreshToken.count({
      where: { userId: (admin.body.user as { id: string }).id, revokedAt: null },
    });
    expect(active).toBe(0);
  });

  it('super admin revoga sessão específica e todas as sessões de um usuário', async () => {
    const platform = await platformLogin();
    const atendente = await loginAs(app, { email: 'atendente@oficina.local' });
    await loginAs(app, { email: 'atendente@oficina.local' });

    const sessions = await request(app.getHttpServer())
      .get('/api/platform/sessions')
      .set(authHeader(platform.token))
      .expect(200);

    const target = (sessions.body as Array<{ id: string; userEmail: string; userId: string }>).find(
      (s) => s.userEmail === 'atendente@oficina.local',
    );
    expect(target).toBeTruthy();

    await request(app.getHttpServer())
      .delete(`/api/platform/sessions/${target!.id}`)
      .set(authHeader(platform.token))
      .expect(204);

    const one = await prisma.refreshToken.findUniqueOrThrow({ where: { id: target!.id } });
    expect(one.revokedAt).not.toBeNull();

    await request(app.getHttpServer())
      .post(`/api/platform/sessions/users/${(atendente.body.user as { id: string }).id}/logout-all`)
      .set(authHeader(platform.token))
      .expect(204);

    const remaining = await prisma.refreshToken.count({
      where: { userId: (atendente.body.user as { id: string }).id, revokedAt: null },
    });
    expect(remaining).toBe(0);
  });
});
