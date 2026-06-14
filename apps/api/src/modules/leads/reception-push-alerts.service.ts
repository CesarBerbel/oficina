import { Injectable } from '@nestjs/common';
import { LeadStatus, type Role } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const ALERT_ROLES = ['ADMIN', 'ATENDENTE'] satisfies Role[];
const UPCOMING_FOLLOW_UP_WINDOW_MINUTES = 30;
const OVERDUE_FOLLOW_UP_MINUTES = 15;

@Injectable()
export class ReceptionPushAlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Executa a verificação de alertas da Central de Pré-atendimento.
   *
   * O schema atual de Lead não possui campos de chegada/check-in ou agenda
   * técnica, como appointmentStartAt/checkedInAt. Por isso os alertas usam
   * nextFollowUpAt, que é o campo existente para retorno ou visita agendada.
   */
  async run(now = new Date()): Promise<void> {
    await this.notifyUpcomingFollowUps(now);
    await this.notifyOverdueFollowUps(now);
  }

  private async notifyUpcomingFollowUps(now: Date): Promise<void> {
    const windowEnd = new Date(
      now.getTime() + UPCOMING_FOLLOW_UP_WINDOW_MINUTES * 60_000,
    );

    const leads = await this.prisma.lead.findMany({
      where: {
        status: { in: [LeadStatus.AGENDADO, LeadStatus.RETORNAR_DEPOIS] },
        nextFollowUpAt: { gte: now, lte: windowEnd },
        closedAt: null,
        convertedAt: null,
      },
      orderBy: { nextFollowUpAt: 'asc' },
      select: {
        id: true,
        tenantId: true,
        name: true,
        phone: true,
        plate: true,
        vehicle: true,
        nextFollowUpAt: true,
      },
    });

    for (const lead of leads) {
      const start = lead.nextFollowUpAt ?? now;
      await this.notifications.notifyRolesOnce(
        lead.tenantId,
        ALERT_ROLES,
        {
          type: 'LEAD_FOLLOW_UP_UPCOMING',
          title: 'Retorno de lead próximo',
          body: this.describeLead(
            lead,
            `Retorno previsto para ${this.formatTime(start)}.`,
          ),
          link: `/leads?leadId=${lead.id}`,
          entity: 'lead',
          entityId: lead.id,
        },
        new Date(start.getTime() - UPCOMING_FOLLOW_UP_WINDOW_MINUTES * 60_000),
      );
    }
  }

  private async notifyOverdueFollowUps(now: Date): Promise<void> {
    const overdueCutoff = new Date(
      now.getTime() - OVERDUE_FOLLOW_UP_MINUTES * 60_000,
    );

    const leads = await this.prisma.lead.findMany({
      where: {
        status: { in: [LeadStatus.AGENDADO, LeadStatus.RETORNAR_DEPOIS] },
        nextFollowUpAt: { lte: overdueCutoff },
        closedAt: null,
        convertedAt: null,
      },
      orderBy: { nextFollowUpAt: 'asc' },
      select: {
        id: true,
        tenantId: true,
        name: true,
        phone: true,
        plate: true,
        vehicle: true,
        nextFollowUpAt: true,
      },
    });

    for (const lead of leads) {
      const start = lead.nextFollowUpAt ?? now;
      await this.notifications.notifyRolesOnce(
        lead.tenantId,
        ALERT_ROLES,
        {
          type: 'LEAD_FOLLOW_UP_OVERDUE',
          title: 'Retorno de lead atrasado',
          body: this.describeLead(
            lead,
            `Retorno estava previsto para ${this.formatTime(start)}.`,
          ),
          link: `/leads?leadId=${lead.id}`,
          entity: 'lead',
          entityId: lead.id,
        },
        start,
      );
    }
  }

  private describeLead(
    lead: {
      name: string;
      phone: string;
      plate: string | null;
      vehicle: string | null;
    },
    suffix: string,
  ): string {
    const vehicle = lead.plate ?? lead.vehicle;
    const details = vehicle ? `${lead.name} - ${vehicle}` : lead.name;
    return `${details}. Telefone: ${lead.phone}. ${suffix}`;
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
