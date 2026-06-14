import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './support/e2e-app';
import { resetAndSeed, prisma } from './support/e2e-db';
import { authHeader, loginAs } from './support/e2e-http';

describe('Categorias e marcas (e2e)', () => {
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

  it('permite criar e excluir categoria sem corpo JSON na resposta', async () => {
    const session = await loginAs(app);

    const created = await request(app.getHttpServer())
      .post('/api/categories')
      .set(authHeader(session.token))
      .send({ kind: 'PART', name: 'Filtros', active: true })
      .expect(201);

    expect(created.body).toMatchObject({
      kind: 'PART',
      name: 'Filtros',
      active: true,
    });

    await request(app.getHttpServer())
      .delete(`/api/categories/${created.body.id}`)
      .set(authHeader(session.token))
      .expect(204);

    const found = await prisma.category.findUnique({ where: { id: created.body.id } });
    expect(found).toBeNull();
  });

  it('permite criar e excluir marca sem corpo JSON na resposta', async () => {
    const session = await loginAs(app);

    const created = await request(app.getHttpServer())
      .post('/api/categories')
      .set(authHeader(session.token))
      .send({ kind: 'BRAND', name: 'Bosch', active: true })
      .expect(201);

    expect(created.body).toMatchObject({
      kind: 'BRAND',
      name: 'Bosch',
      active: true,
    });

    await request(app.getHttpServer())
      .delete(`/api/categories/${created.body.id}`)
      .set(authHeader(session.token))
      .expect(204);

    const found = await prisma.category.findUnique({ where: { id: created.body.id } });
    expect(found).toBeNull();
  });
});
