import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './support/e2e-app';
import { resetAndSeed } from './support/e2e-db';
import { authHeader, loginAs } from './support/e2e-http';

describe('Uploads seguros (e2e)', () => {
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

  it('bloqueia upload sem autenticação', async () => {
    await request(app.getHttpServer())
      .post('/api/uploads')
      .attach('file', Buffer.from('GIF89a'), {
        filename: 'image.gif',
        contentType: 'image/gif',
      })
      .expect(401);
  });

  it('rejeita SVG e arquivos com MIME forjado', async () => {
    const admin = await loginAs(app);

    await request(app.getHttpServer())
      .post('/api/uploads')
      .set(authHeader(admin.token))
      .attach('file', Buffer.from('<svg><script>alert(1)</script></svg>'), {
        filename: 'malicioso.svg',
        contentType: 'image/svg+xml',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/uploads')
      .set(authHeader(admin.token))
      .attach('file', Buffer.from('isto-nao-e-png'), {
        filename: 'falso.png',
        contentType: 'image/png',
      })
      .expect(400);
  });

  it('aceita imagem válida detectando assinatura real do arquivo', async () => {
    const admin = await loginAs(app);
    const tinyGif = Buffer.from(
      '47494638396101000100800000000000ffffff2c00000000010001000002024401003b',
      'hex',
    );

    const upload = await request(app.getHttpServer())
      .post('/api/uploads')
      .set(authHeader(admin.token))
      .attach('file', tinyGif, {
        filename: 'foto-oficina.gif',
        contentType: 'image/gif',
      })
      .expect(201);

    expect(upload.body.url).toMatch(/\/uploads\/[a-f0-9]{32}\.gif$/);

    // Sem APP_URL, a URL é relativa; usa uma base só para extrair o pathname.
    const publicPath = new URL(upload.body.url, 'http://localhost').pathname;
    await request(app.getHttpServer())
      .get(publicPath)
      .expect('X-Content-Type-Options', 'nosniff')
      .expect(200);
  });
});
