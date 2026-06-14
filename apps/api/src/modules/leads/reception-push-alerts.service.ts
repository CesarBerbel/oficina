import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { LeadStatus, type Role } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const ALERT_ROLES: Role[] = ['ADMIN', 'ATENDENTE'];
const ARRIVAL_WINDOW_MINUTES = 60;
const NO_SHOW_TOLERANCE_MINUTES = 15;
const CHECKED_IN_WITHOUT_OS_MINUTES = 10;
const SCAN_INTERVAL_MS = 60_000;

/**
 * Converte alertas operacionais da Recepção em notificações internas e Web Push.
 *
 * A tela /leads continua consultando GET /leads/reception-alerts para exibição
 * em tempo real, mas este serviço garante que celulares com PWA instalado e
 * push ativado recebam avisos mesmo fora da tela da Recepção.
 */
@Injectable()
export class ReceptionPushAlertsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReceptionPushAlertsService.name);
  private timer: NodeJS.Timeout | null = null;
  private initialTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.scan(), SCAN_INTERVAL_MS);
    this.initialTimer = setTimeout(() => void this.scan(), 10_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.initialTimer) clearTimeout(this.initialTimer);
  }

  async scan(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const arrivalEnd = new Date(now.getTime() + ARRIVAL_WINDOW_MINUTES * 60_000);
      const noShowCutoff = new Date(now.getTime() - NO_SHOW_TOLERANCE_MINUTES * 60_000);
      const checkedInCutoff = new Date(
        now.getTime() - CHECKED_IN_WITHOUT_OS_MINUTES * 60_000,
      );

      const [arrivals, noShows, checkedInWithoutOs] = await this.prisma.$transaction([
        this.prisma.lead.findMany({
          where: {
            status: { in: [LeadStatus.AGENDADO, LeadStatus.CONFIRMADO] },
            appointmentStartAt: { gte: now, lte: arrivalEnd },
            convertedServiceOrderId: null,
            checkedInAt: null,
            noShowAt: null,
            appointmentCanceledAt: null,
          },
          orderBy: { appointmentStartAt: 'asc' },
          take: 50,
        }),
        this.prisma.lead.findMany({
          where: {
            status: { in: [LeadStatus.AGENDADO, LeadStatus.CONFIRMADO] },
            appointmentStartAt: { lte: noShowCutoff },
            convertedServiceOrderId: null,
            checkedInAt: null,
            noShowAt: null,
            appointmentCanceledAt: null,
          },
          orderBy: { appointmentStartAt: 'asc' },
          take: 50,
        }),
        this.prisma.lead.findMany({
          where: {
            status: LeadStatus.CLIENTE_CHEGOU,
            checkedInAt: { lte: checkedInCutoff },
            convertedServiceOrderId: null,
          },
          orderBy: { checkedInAt: 'asc' },
          take: 50,
        }),
      ]);

      for (const lead of arrivals) {
        const start = lead.appointmentStartAt ?? now;
        const minutes = Math.max(0, Math.round((start.getTime() - now.getTime()) / 60_000));
        await this.notifications.notifyRolesOnce(
          lead.tenantId,
          ALERT_ROLES,
          {
            type: 'RECEPTION_APPOINTMENT_UPCOMING',
            title: 'Cliente perto de chegar',
            body: `${lead.name} chega em aproximadamente ${minutes} min.`,
            link: `/leads?selected=${lead.id}`,
            entity: 'Lead',
            entityId: lead.id,
          },
          new Date(start.getTime() - ARRIVAL_WINDOW_MINUTES * 60_000),
        );
      }

      for (const lead of noShows) {
        const start = lead.appointmentStartAt ?? now;
        const minutes = Math.max(0, Math.round((now.getTime() - start.getTime()) / 60_000));
        await this.notifications.notifyRolesOnce(
          lead.tenantId,
          ALERT_ROLES,
          {
            type: 'RECEPTION_NO_SHOW_PENDING',
            title: 'Registrar não comparecimento',
            body: `${lead.name} está ${minutes} min atrasado. Registre chegada ou não comparecimento.`,
            link: `/leads?selected=${lead.id}`,
            entity: 'Lead',
            entityId: lead.id,
          },
          start,
        );
      }

      for (const lead of checkedInWithoutOs) {
        const checkedInAt = lead.checkedInAt ?? now;
        await this.notifications.notifyRolesOnce(
          lead.tenantId,
          ALERT_ROLES,
          {
            type: 'RECEPTION_CHECKED_IN_WITHOUT_OS',
            title: 'Cliente aguardando OS',
            body: `${lead.name} já chegou. Converta o atendimento em OS quando possível.`,
            link: `/leads?selected=${lead.id}`,
            entity: 'Lead',
            entityId: lead.id,
          },
          checkedInAt,
        );
      }
    } catch (err) {
      this.logger.warn(`Falha ao verificar alertas push da Recepção: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }
}
