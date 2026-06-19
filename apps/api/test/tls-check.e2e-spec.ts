import type { INestApplication } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { createE2eApp } from './support/e2e-app';
import { prisma, resetAndSeed } from './support/e2e-db';

/**
 * Porteiro do TLS on-demand (Caddy `ask`): 200 só para domínio de oficina
 * verificado; 404 para não-verificado, inexistente ou sem domínio.
 */
describe('TLS check on-demand (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createE2eApp();
  });

  beforeEach(async () => {
    await resetAndSeed();
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { slug: 'oficina-modelo' },
      select: { id: true },
    });
    await prisma.tenantDomain.create({
      data: {
        tenantId: tenant.id,
        domain: 'verificado.com.br',
        verificationToken: randomBytes(8).toString('hex'),
        verifiedAt: new Date(),
        status: 'VERIFIED',
        isPrimary: true,
      },
    });
    await prisma.tenantDomain.create({
      data: {
        tenantId: tenant.id,
        domain: 'pendente.com.br',
        verificationToken: randomBytes(8).toString('hex'),
        verifiedAt: null,
        isPrimary: false,
      },
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('200 para domínio verificado', async () => {
    await request(app.getHttpServer())
      .get('/api/internal/tls-check')
      .query({ domain: 'verificado.com.br' })
      .expect(200);
  });

  it('aceita variação de caixa e ponto final', async () => {
    await request(app.getHttpServer())
      .get('/api/internal/tls-check')
      .query({ domain: 'Verificado.com.br.' })
      .expect(200);
  });

  it('404 para domínio cadastrado mas não verificado', async () => {
    await request(app.getHttpServer())
      .get('/api/internal/tls-check')
      .query({ domain: 'pendente.com.br' })
      .expect(404);
  });

  it('404 para domínio inexistente', async () => {
    await request(app.getHttpServer())
      .get('/api/internal/tls-check')
      .query({ domain: 'qualquer-coisa.com' })
      .expect(404);
  });

  it('404 sem o parâmetro domain', async () => {
    await request(app.getHttpServer()).get('/api/internal/tls-check').expect(404);
  });
});
