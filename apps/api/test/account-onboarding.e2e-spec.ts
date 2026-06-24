import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MailService } from '../src/infra/mail/mail.service';
import { createE2eApp } from './support/e2e-app';
import { prisma, resetAndSeed } from './support/e2e-db';
import { authHeader, loginAs } from './support/e2e-http';

const BASE = 'saecbpa.test';

/**
 * Onboarding por host (começar → aguardando → aprovação):
 * - GET /auth/context sinaliza pedido pendente para o slug do subdomínio livre;
 * - o front client-side repassa o host real por x-public-host (override de dev);
 * - aprovar um pedido envia um link seguro de "definir senha" ao solicitante.
 */
describe('Onboarding de conta por host (e2e)', () => {
  let app: INestApplication;
  let prevBaseDomain: string | undefined;

  beforeAll(async () => {
    // suggestedSlug/isPlatformHost leem PLATFORM_BASE_DOMAIN em tempo de request.
    prevBaseDomain = process.env.PLATFORM_BASE_DOMAIN;
    process.env.PLATFORM_BASE_DOMAIN = BASE;
    app = await createE2eApp();
  });

  beforeEach(async () => {
    await resetAndSeed();
  });

  afterAll(async () => {
    if (prevBaseDomain === undefined) delete process.env.PLATFORM_BASE_DOMAIN;
    else process.env.PLATFORM_BASE_DOMAIN = prevBaseDomain;
    await app?.close();
  });

  async function platformToken(): Promise<string> {
    await prisma.user.updateMany({
      where: { email: 'admin@oficina.local' },
      data: { superAdmin: true },
    });
    return (await loginAs(app)).token;
  }

  describe('GET /auth/context — pedido pendente', () => {
    it('subdomínio livre sem pedido sugere o slug e não marca pendente', async () => {
      const ctx = await request(app.getHttpServer())
        .get('/api/auth/context')
        .set('X-Forwarded-Host', `nova-oficina.${BASE}`)
        .expect(200);

      expect(ctx.body.account).toBeNull();
      expect(ctx.body.suggestedSlug).toBe('nova-oficina');
      expect(ctx.body.pendingRequest).toBe(false);
    });

    it('subdomínio livre COM pedido pendente marca pendingRequest', async () => {
      await prisma.accountRequest.create({
        data: {
          name: 'Oficina Pendente',
          slug: 'nova-pendente',
          contactName: 'Dono',
          email: 'dono@nova-pendente.com',
        },
      });

      const ctx = await request(app.getHttpServer())
        .get('/api/auth/context')
        .set('X-Forwarded-Host', `nova-pendente.${BASE}`)
        .expect(200);

      expect(ctx.body.account).toBeNull();
      expect(ctx.body.suggestedSlug).toBe('nova-pendente');
      expect(ctx.body.pendingRequest).toBe(true);
    });

    it('um pedido já recusado NÃO marca pendingRequest (só PENDING conta)', async () => {
      await prisma.accountRequest.create({
        data: {
          name: 'Oficina Recusada',
          slug: 'nova-recusada',
          contactName: 'Dono',
          email: 'dono@nova-recusada.com',
          status: 'REJECTED',
        },
      });

      const ctx = await request(app.getHttpServer())
        .get('/api/auth/context')
        .set('X-Forwarded-Host', `nova-recusada.${BASE}`)
        .expect(200);

      expect(ctx.body.pendingRequest).toBe(false);
      expect(ctx.body.suggestedSlug).toBe('nova-recusada');
    });
  });

  describe('GET /auth/context — override x-public-host (dev)', () => {
    it('resolve o host pelo x-public-host quando não há X-Forwarded-Host', async () => {
      // Sem nenhum override o host real é o do supertest (127.0.0.1) → nada a sugerir.
      const semHost = await request(app.getHttpServer()).get('/api/auth/context').expect(200);
      expect(semHost.body.suggestedSlug).toBeNull();

      // O front client-side chama a API direto em localhost:3333; o subdomínio do
      // browser chega por x-public-host (honrado fora de produção).
      const comOverride = await request(app.getHttpServer())
        .get('/api/auth/context')
        .set('X-Public-Host', `livre-host.${BASE}`)
        .expect(200);
      expect(comOverride.body.suggestedSlug).toBe('livre-host');
    });
  });

  describe('Aprovação envia link de "definir senha"', () => {
    it('manda o e-mail com link no subdomínio da conta e o link redefine a senha', async () => {
      const mail = app.get(MailService);
      const sendSpy = jest
        .spyOn(mail, 'send')
        .mockResolvedValue({ ok: false, skipped: true, error: null });

      const token = await platformToken();
      const req = await prisma.accountRequest.create({
        data: {
          name: 'Oficina Welcome',
          slug: 'pedido-welcome',
          contactName: 'Dona da Oficina',
          email: 'dono@pedido-welcome.com',
        },
      });

      await request(app.getHttpServer())
        .post(`/api/platform/accounts/requests/${req.id}/approve`)
        .set(authHeader(token))
        .expect(201);

      // E-mail de boas-vindas enviado ao solicitante, com link no subdomínio da conta.
      expect(sendSpy).toHaveBeenCalledTimes(1);
      const sent = sendSpy.mock.calls[0]?.[0];
      expect(sent?.to).toBe('dono@pedido-welcome.com');
      expect(sent?.text).toContain(`pedido-welcome.${BASE}`);
      const match = /\/redefinir-senha\?token=([a-f0-9]+)/.exec(sent?.text ?? '');
      expect(match).not.toBeNull();
      const resetToken = match![1];

      // Um token de definição de senha foi gravado para o novo admin.
      const admin = await prisma.user.findFirstOrThrow({
        where: { email: 'dono@pedido-welcome.com' },
        select: { id: true },
      });
      const stored = await prisma.passwordResetToken.findMany({
        where: { userId: admin.id, usedAt: null },
      });
      expect(stored).toHaveLength(1);

      sendSpy.mockRestore();

      // O link funciona: define a senha e o admin loga sem troca obrigatória.
      await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token: resetToken, password: 'minha-senha-forte' })
        .expect(200);

      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          tenantSlug: 'pedido-welcome',
          email: 'dono@pedido-welcome.com',
          password: 'minha-senha-forte',
        })
        .expect(200);
      expect(login.body.user.forcePasswordChange).toBe(false);
    });
  });
});
