import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * E2E de fumaça: sobe a app real (com banco) e exercita o fluxo crítico de
 * autenticação + RBAC. Requer Postgres rodando e seed aplicado.
 */
describe('App (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/health → ok', async () => {
    const res = await request(server).get('/api/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('up');
  });

  it('rejeita login inválido (401)', async () => {
    await request(server)
      .post('/api/auth/login')
      .send({
        tenantSlug: 'oficina-modelo',
        email: 'admin@oficina.local',
        password: 'errada',
      })
      .expect(401);
  });

  it('bloqueia rota protegida sem token (401)', async () => {
    await request(server).get('/api/customers').expect(401);
  });

  describe('autenticado como admin', () => {
    let token: string;

    it('faz login com o admin do seed', async () => {
      const res = await request(server)
        .post('/api/auth/login')
        .send({
          tenantSlug: 'oficina-modelo',
          email: 'admin@oficina.local',
          password: 'Admin@123',
        })
        .expect(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.role).toBe('ADMIN');
      token = res.body.accessToken;
    });

    it('lista clientes com token (200)', async () => {
      await request(server)
        .get('/api/customers')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('retorna o usuário atual em /api/auth/me', async () => {
      const res = await request(server)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.email).toBe('admin@oficina.local');
      expect(Array.isArray(res.body.permissions)).toBe(true);
    });
  });
});
