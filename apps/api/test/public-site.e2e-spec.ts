import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './support/e2e-app';
import { OTHER_TENANT_SLUG, resetAndSeed, TENANT_SLUG } from './support/e2e-db';
import { authHeader, loginAs } from './support/e2e-http';

describe('Site público, leads e resolução de tenant (e2e)', () => {
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

  it('resolve site publicado por query param, header e rota por slug', async () => {
    const byQuery = await request(app.getHttpServer())
      .get(`/api/public/site?tenantSlug=${TENANT_SLUG}`)
      .expect(200);
    expect(byQuery.body.settings.shopName).toBe('Oficina Modelo');

    const byHeader = await request(app.getHttpServer())
      .get('/api/public/site')
      .set('X-Public-Tenant-Slug', OTHER_TENANT_SLUG)
      .expect(200);
    expect(byHeader.body.settings.shopName).toBe('Oficina Concorrente');

    const bySlug = await request(app.getHttpServer())
      .get(`/api/public/site/by-slug/${TENANT_SLUG}`)
      .expect(200);
    expect(bySlug.body.services).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Revisão preventiva' }),
      ]),
    );
  });

  it('não escolhe tenant implicitamente quando há múltiplos sites publicados', async () => {
    await request(app.getHttpServer()).get('/api/public/site').expect(404);
  });

  it('cria lead público no tenant correto e permite gestão interna do status', async () => {
    await request(app.getHttpServer())
      .post(`/api/public/lead?tenantSlug=${TENANT_SLUG}`)
      .send({
        name: 'Lead Público',
        phone: '11912345678',
        email: 'lead.publico@example.com',
        vehicle: 'Honda Civic 2018',
        message: 'Gostaria de um orçamento para revisão.',
      })
      .expect(201)
      .expect(({ body }) => expect(body.ok).toBe(true));

    const admin = await loginAs(app);
    const leads = await request(app.getHttpServer())
      .get('/api/leads')
      .set(authHeader(admin.token))
      .expect(200);

    expect(leads.body.data).toHaveLength(1);
    expect(leads.body.data[0]).toMatchObject({
      name: 'Lead Público',
      status: 'NOVO',
    });

    const updated = await request(app.getHttpServer())
      .post(`/api/leads/${leads.body.data[0].id}/status`)
      .set(authHeader(admin.token))
      .send({ status: 'EM_ATENDIMENTO' })
      .expect(201);

    expect(updated.body.status).toBe('EM_ATENDIMENTO');

    const start = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const end = start;
    const scheduled = await request(app.getHttpServer())
      .post(`/api/leads/${leads.body.data[0].id}/schedule`)
      .set(authHeader(admin.token))
      .send({
        appointmentStartAt: start,
        appointmentEndAt: end,
        appointmentServiceType: 'Diagnóstico',
        appointmentNotes: 'Cliente pediu avaliação inicial.',
      })
      .expect(201);

    expect(scheduled.body.status).toBe('AGENDADO');
    expect(scheduled.body.appointmentStartAt).toBe(start);

    const receptionAlerts = await request(app.getHttpServer())
      .get('/api/leads/reception-alerts')
      .set(authHeader(admin.token))
      .expect(200);

    expect(receptionAlerts.body.upcomingArrivals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: leads.body.data[0].id, name: 'Lead Público' }),
      ]),
    );
    expect(receptionAlerts.body.arrivalWindowMinutes).toBe(60);
    expect(Array.isArray(receptionAlerts.body.overdueFollowUps)).toBe(true);
    expect(Array.isArray(receptionAlerts.body.checkedInWithoutOs)).toBe(true);

    const confirmed = await request(app.getHttpServer())
      .post(`/api/leads/${leads.body.data[0].id}/confirm-appointment`)
      .set(authHeader(admin.token))
      .send({ notes: 'Confirmado por WhatsApp.' })
      .expect(201);

    expect(confirmed.body.status).toBe('CONFIRMADO');
    expect(confirmed.body.appointmentConfirmedAt).toBeTruthy();

    const checkedIn = await request(app.getHttpServer())
      .post(`/api/leads/${leads.body.data[0].id}/check-in`)
      .set(authHeader(admin.token))
      .send({ notes: 'Cliente chegou na recepção.' })
      .expect(201);

    expect(checkedIn.body.status).toBe('CLIENTE_CHEGOU');
    expect(checkedIn.body.checkedInAt).toBeTruthy();

    const checkedInAlerts = await request(app.getHttpServer())
      .get('/api/leads/reception-alerts')
      .set(authHeader(admin.token))
      .expect(200);

    expect(checkedInAlerts.body.checkedInWithoutOs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: leads.body.data[0].id, name: 'Lead Público' }),
      ]),
    );

    const canceledCheckIn = await request(app.getHttpServer())
      .post(`/api/leads/${leads.body.data[0].id}/cancel-check-in`)
      .set(authHeader(admin.token))
      .send({ notes: 'Chegada registrada por engano.' })
      .expect(201);

    expect(canceledCheckIn.body.status).toBe('CONFIRMADO');
    expect(canceledCheckIn.body.checkedInAt).toBeNull();
    expect(canceledCheckIn.body.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'CHECK_IN_CANCELED' }),
      ]),
    );

    const noShow = await request(app.getHttpServer())
      .post(`/api/leads/${leads.body.data[0].id}/no-show`)
      .set(authHeader(admin.token))
      .send({ notes: 'Cliente não compareceu no horário combinado.' })
      .expect(201);

    expect(noShow.body.status).toBe('NAO_COMPARECEU');
    expect(noShow.body.noShowAt).toBeTruthy();
  });


  it('retorna alertas da recepção para clientes atrasados', async () => {
    await request(app.getHttpServer())
      .post(`/api/public/lead?tenantSlug=${TENANT_SLUG}`)
      .send({
        name: 'Lead Atrasado',
        phone: '11955554444',
        vehicle: 'Toyota Corolla 2020',
        message: 'Cliente marcou horário e ainda não chegou.',
      })
      .expect(201);

    const admin = await loginAs(app);
    const leads = await request(app.getHttpServer())
      .get('/api/leads')
      .set(authHeader(admin.token))
      .expect(200);

    const leadId = leads.body.data[0].id;
    const start = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    await request(app.getHttpServer())
      .post(`/api/leads/${leadId}/schedule`)
      .set(authHeader(admin.token))
      .send({ appointmentStartAt: start, appointmentEndAt: start })
      .expect(201);

    const alerts = await request(app.getHttpServer())
      .get('/api/leads/reception-alerts')
      .set(authHeader(admin.token))
      .expect(200);

    expect(alerts.body.noShowCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: leadId, name: 'Lead Atrasado' }),
      ]),
    );
    expect(alerts.body.noShowToleranceMinutes).toBe(15);
  });

  it('recebe cliente direto na oficina já com chegada registrada', async () => {
    const admin = await loginAs(app);

    const received = await request(app.getHttpServer())
      .post('/api/leads/direct-reception')
      .set(authHeader(admin.token))
      .send({
        name: 'Cliente Presencial',
        phone: '11977776666',
        plate: 'DIR1T23',
        vehicle: 'Fiat Uno 2015',
        message: 'Cliente chegou direto na recepção relatando falha ao ligar.',
        appointmentServiceType: 'Diagnóstico presencial',
        appointmentNotes: 'Veículo está no pátio.',
      })
      .expect(201);

    expect(received.body).toMatchObject({
      name: 'Cliente Presencial',
      status: 'CLIENTE_CHEGOU',
      plate: 'DIR1T23',
      appointmentServiceType: 'Diagnóstico presencial',
    });
    expect(received.body.appointmentStartAt).toBeTruthy();
    expect(received.body.appointmentEndAt).toBe(received.body.appointmentStartAt);
    expect(received.body.checkedInAt).toBeTruthy();
    expect(received.body.contactAttempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: 'PRESENCIAL', outcome: 'CLIENTE_CHEGOU' }),
      ]),
    );
    expect(received.body.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'DIRECT_RECEPTION_CREATED' }),
        expect.objectContaining({ type: 'CHECKED_IN' }),
      ]),
    );

    const canceledCheckIn = await request(app.getHttpServer())
      .post(`/api/leads/${received.body.id}/cancel-check-in`)
      .set(authHeader(admin.token))
      .send({ notes: 'Cliente saiu antes da abertura da OS.' })
      .expect(201);

    expect(canceledCheckIn.body.status).toBe('AGENDADO');
    expect(canceledCheckIn.body.checkedInAt).toBeNull();
    expect(canceledCheckIn.body.appointmentStartAt).toBeTruthy();
  });

});
