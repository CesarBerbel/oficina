import type { INestApplication } from '@nestjs/common';
import { createE2eApp } from './support/e2e-app';
import { prisma, resetAndSeed } from './support/e2e-db';
import { SystemAlertsMonitorService } from '../src/modules/metrics/system-alerts-monitor.service';

/**
 * Alertas ativos: o monitor varre as métricas e notifica os admins quando um
 * alerta surge, deduplicando dentro da janela de cooldown.
 */
describe('Alertas ativos (e2e)', () => {
  let app: INestApplication;
  let monitor: SystemAlertsMonitorService;

  beforeAll(async () => {
    app = await createE2eApp();
    monitor = app.get(SystemAlertsMonitorService);
  });

  beforeEach(async () => {
    await resetAndSeed();
  });

  afterAll(async () => {
    await app?.close();
  });

  const countSystemAlerts = () => prisma.notification.count({ where: { type: 'SYSTEM_ALERT' } });

  it('uma varredura notifica os admins; a seguinte não duplica (cooldown)', async () => {
    // Sem heartbeat de backup no ambiente de teste → alerta crítico de backup.
    await monitor.scan();
    const first = await countSystemAlerts();
    expect(first).toBeGreaterThan(0);

    // Notificação de backup direcionada (critical) aos admins.
    const backup = await prisma.notification.findFirst({
      where: { type: 'SYSTEM_ALERT', entity: 'SystemAlert', entityId: 'backup' },
    });
    expect(backup).not.toBeNull();
    expect(backup?.link).toBe('/metricas');

    // Segunda varredura imediata: cooldown impede duplicar.
    await monitor.scan();
    const second = await countSystemAlerts();
    expect(second).toBe(first);
  });

  it('quando o alerta some, a marca é limpa e ele volta a disparar', async () => {
    await monitor.scan();
    const afterFirst = await countSystemAlerts();

    // Simula backup recente → o alerta de backup deixa de existir.
    await prisma.opsHeartbeat.upsert({
      where: { key: 'backup' },
      create: { key: 'backup', at: new Date(), note: 'teste' },
      update: { at: new Date() },
    });
    await monitor.scan(); // resolve: apaga a marca alert:*:backup
    const backupKeys = await prisma.opsHeartbeat.count({
      where: { key: { endsWith: ':backup' } },
    });
    expect(backupKeys).toBe(0);

    // Backup volta a ficar velho → alerta reaparece e dispara de novo.
    await prisma.opsHeartbeat.delete({ where: { key: 'backup' } });
    await monitor.scan();
    const afterReappear = await countSystemAlerts();
    expect(afterReappear).toBeGreaterThan(afterFirst);
  });
});
