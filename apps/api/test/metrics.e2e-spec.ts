import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './support/e2e-app';
import { resetAndSeed } from './support/e2e-db';
import { authHeader, loginAs } from './support/e2e-http';

/**
 * Métricas do sistema: além de outbox/ledger, o endpoint agora expõe IA, SMTP,
 * backup e saúde, com uma lista de alertas derivada.
 */
describe('Métricas do sistema (e2e)', () => {
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

  it('GET /api/metrics retorna todas as seções e os alertas derivados', async () => {
    const admin = await loginAs(app);
    const res = await request(app.getHttpServer())
      .get('/api/metrics')
      .set(authHeader(admin.token))
      .expect(200);

    const body = res.body;
    expect(body).toHaveProperty('outbox');
    expect(body).toHaveProperty('ledger');
    expect(body).toHaveProperty('ai');
    expect(body).toHaveProperty('smtp');
    expect(body).toHaveProperty('backup');
    expect(body).toHaveProperty('health');
    expect(Array.isArray(body.alerts)).toBe(true);

    // Banco acessível durante o teste.
    expect(body.health.dbOk).toBe(true);

    // Sem heartbeat de backup no ambiente de teste → backup não-ok + alerta.
    expect(body.backup.ok).toBe(false);
    expect(body.backup.lastAt).toBeNull();
    expect(body.alerts.some((a: { source: string }) => a.source === 'backup')).toBe(true);
  });
});
