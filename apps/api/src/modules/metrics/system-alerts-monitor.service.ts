import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Role } from '@prisma/client';
import type { MetricAlert } from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MailService } from '../../infra/mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MetricsService } from './metrics.service';

const ADMIN_ROLES: Role[] = ['ADMIN'];
/** Prefixo das chaves de dedup no OpsHeartbeat. */
const KEY_PREFIX = 'alert';

/**
 * Alertas ativos: varre periodicamente as métricas de cada oficina e, quando um
 * alerta surge, notifica os admins (in-app + Web Push; e-mail nos críticos).
 *
 * Dedup/cooldown via OpsHeartbeat: cada alerta (por origem) só renotifica após
 * ALERT_RENOTIFY_HOURS. Quando o alerta some, a chave é apagada — assim ele
 * dispara de novo na próxima ocorrência, sem ficar preso pelo cooldown.
 */
@Injectable()
export class SystemAlertsMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SystemAlertsMonitorService.name);
  private timer: NodeJS.Timeout | null = null;
  private initialTimer: NodeJS.Timeout | null = null;
  private running = false;

  private readonly intervalMs = Number(process.env.ALERT_SCAN_INTERVAL_MS ?? 300_000);
  private readonly cooldownMs = Number(process.env.ALERT_RENOTIFY_HOURS ?? 24) * 3_600_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  onModuleInit(): void {
    // Não roda em teste (chamamos scan() direto) nem se desligado por env.
    if (process.env.NODE_ENV === 'test' || process.env.ALERT_MONITOR_ENABLED === 'false') return;
    this.timer = setInterval(() => void this.scan(), this.intervalMs);
    this.initialTimer = setTimeout(() => void this.scan(), 15_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.initialTimer) clearTimeout(this.initialTimer);
  }

  async scan(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const tenants = await this.prisma.tenant.findMany({
        where: { active: true },
        select: { id: true },
      });
      for (const { id } of tenants) {
        try {
          const { alerts } = await this.metrics.system(id);
          await this.processTenant(id, alerts);
        } catch (err) {
          this.logger.warn(`Falha ao avaliar alertas do tenant ${id}: ${String(err)}`);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private keyFor(tenantId: string, source: string): string {
    return `${KEY_PREFIX}:${tenantId}:${source}`;
  }

  private async processTenant(tenantId: string, alerts: MetricAlert[]): Promise<void> {
    const now = Date.now();
    const existing = await this.prisma.opsHeartbeat.findMany({
      where: { key: { startsWith: `${KEY_PREFIX}:${tenantId}:` } },
    });
    const lastByKey = new Map(existing.map((h) => [h.key, h.at.getTime()]));
    const activeKeys = new Set(alerts.map((a) => this.keyFor(tenantId, a.source)));

    for (const alert of alerts) {
      const key = this.keyFor(tenantId, alert.source);
      const last = lastByKey.get(key);
      const shouldFire = last == null || now - last >= this.cooldownMs;
      if (!shouldFire) continue;
      await this.fire(tenantId, alert);
      await this.prisma.opsHeartbeat.upsert({
        where: { key },
        create: { key, at: new Date(), note: alert.message },
        update: { at: new Date(), note: alert.message },
      });
    }

    // Alertas que sumiram: limpa a marca para redisparar quando reaparecerem.
    const stale = existing.filter((h) => !activeKeys.has(h.key)).map((h) => h.key);
    if (stale.length > 0) {
      await this.prisma.opsHeartbeat.deleteMany({ where: { key: { in: stale } } });
    }
  }

  private async fire(tenantId: string, alert: MetricAlert): Promise<void> {
    const prefix = alert.level === 'critical' ? '🔴 Crítico' : '🟠 Atenção';
    await this.notifications.notifyRoles(tenantId, ADMIN_ROLES, {
      type: 'SYSTEM_ALERT',
      title: `${prefix}: ${alert.source}`,
      body: alert.message,
      link: '/metricas',
      entity: 'SystemAlert',
      entityId: alert.source,
    });

    if (alert.level === 'critical') {
      await this.emailAdmins(tenantId, alert);
    }
  }

  private async emailAdmins(tenantId: string, alert: MetricAlert): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: { tenantId, role: 'ADMIN', active: true },
      select: { email: true },
    });
    const subject = `[Oficina] Alerta crítico: ${alert.source}`;
    const text = `${alert.message}\n\nAcesse Métricas do sistema para mais detalhes.`;
    for (const { email } of admins) {
      const res = await this.mail.send({ to: email, subject, text });
      if (!res.ok && !res.skipped) {
        this.logger.warn(`Falha ao enviar alerta por e-mail para ${email}: ${res.error}`);
      }
    }
  }
}
