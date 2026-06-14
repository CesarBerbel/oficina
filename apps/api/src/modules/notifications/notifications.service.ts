import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type Role } from '@prisma/client';
import webpush from 'web-push';
import type {
  ListNotificationsQuery,
  NotificationDto,
  NotificationInboxDto,
  OperationalNotificationCategory,
  OperationalPriority,
  Paginated,
  PushSubscribeInput,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface NotifyPayload {
  type: string;
  title: string;
  body?: string;
  link?: string;
  entity?: string;
  entityId?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private pushEnabled = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const pub = config.get<string>('VAPID_PUBLIC_KEY');
    const priv = config.get<string>('VAPID_PRIVATE_KEY');
    if (pub && priv) {
      webpush.setVapidDetails(
        config.get<string>('VAPID_SUBJECT') ?? 'mailto:admin@oficina.local',
        pub,
        priv,
      );
      this.pushEnabled = true;
    }
  }


  private classifyNotification(n: { type: string; title: string; link: string | null }): {
    category: OperationalNotificationCategory;
    priority: OperationalPriority;
  } {
    const value = `${n.type} ${n.title} ${n.link ?? ''}`.toLowerCase();
    let category: OperationalNotificationCategory = 'sistema';
    if (value.includes('lead') || value.includes('recep') || value.includes('/leads') || value.includes('cliente chegou')) {
      category = 'recepcao';
    } else if (value.includes('crm') || value.includes('revis') || value.includes('pós') || value.includes('pos')) {
      category = 'crm';
    } else if (value.includes('compra') || value.includes('finance') || value.includes('pagamento')) {
      category = 'financeiro';
    } else if (value.includes('os') || value.includes('orçamento') || value.includes('orcamento') || value.includes('/os')) {
      category = 'oficina';
    }

    let priority: OperationalPriority = 'baixa';
    if (value.includes('aprov') || value.includes('chegou') || value.includes('parada') || value.includes('atras')) {
      priority = 'alta';
    } else if (value.includes('agend') || value.includes('retorno') || value.includes('orçamento') || value.includes('orcamento')) {
      priority = 'media';
    }
    return { category, priority };
  }

  async inbox(userId: string): Promise<NotificationInboxDto> {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 80,
    });
    const categories: NotificationInboxDto['categories'] = [
      { category: 'recepcao', label: 'Recepção', unread: 0, total: 0 },
      { category: 'oficina', label: 'Oficina', unread: 0, total: 0 },
      { category: 'crm', label: 'CRM', unread: 0, total: 0 },
      { category: 'financeiro', label: 'Financeiro', unread: 0, total: 0 },
      { category: 'sistema', label: 'Sistema', unread: 0, total: 0 },
    ];
    const byCategory = new Map(categories.map((category) => [category.category, category]));
    const items = rows.map((row) => {
      const classified = this.classifyNotification(row);
      const category = byCategory.get(classified.category);
      if (category) {
        category.total += 1;
        if (!row.read) category.unread += 1;
      }
      return {
        id: row.id,
        type: row.type,
        category: classified.category,
        priority: classified.priority,
        title: row.title,
        body: row.body,
        link: row.link,
        read: row.read,
        createdAt: row.createdAt.toISOString(),
      };
    });
    return {
      generatedAt: new Date().toISOString(),
      unreadTotal: rows.filter((row) => !row.read).length,
      categories,
      items,
    };
  }

  private toDto(n: Prisma.NotificationGetPayload<object>): NotificationDto {
    return {
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    };
  }

  /** Cria notificações para vários usuários e dispara push (um por usuário). */
  async createForUsers(
    tenantId: string,
    userIds: string[],
    payload: NotifyPayload,
  ): Promise<void> {
    for (const userId of [...new Set(userIds)]) {
      const notif = await this.prisma.notification.create({
        data: {
          tenantId,
          userId,
          type: payload.type,
          title: payload.title,
          body: payload.body ?? null,
          link: payload.link ?? null,
          entity: payload.entity ?? null,
          entityId: payload.entityId ?? null,
        },
        select: { id: true },
      });
      await this.sendPush(userId, payload, notif.id);
    }
  }

  /**
   * Cria notificações sem duplicar alertas ainda não lidos para o mesmo alvo.
   * Usado por rotinas recorrentes, como lembretes de pré-atendimento, para que
   * o mesmo lead não gere várias notificações iguais a cada execução do job.
   */
  async createForUsersOnce(
    tenantId: string,
    userIds: string[],
    payload: NotifyPayload,
    dedupeSince?: Date,
  ): Promise<void> {
    for (const userId of [...new Set(userIds)]) {
      const existing = await this.prisma.notification.findFirst({
        where: this.buildOnceWhere(tenantId, userId, payload, dedupeSince),
        select: { id: true },
      });

      if (existing) continue;

      const notif = await this.prisma.notification.create({
        data: {
          tenantId,
          userId,
          type: payload.type,
          title: payload.title,
          body: payload.body ?? null,
          link: payload.link ?? null,
          entity: payload.entity ?? null,
          entityId: payload.entityId ?? null,
        },
        select: { id: true },
      });
      await this.sendPush(userId, payload, notif.id);
    }
  }

  private buildOnceWhere(
    tenantId: string,
    userId: string,
    payload: NotifyPayload,
    dedupeSince?: Date,
  ): Prisma.NotificationWhereInput {
    return {
      tenantId,
      userId,
      type: payload.type,
      title: payload.title,
      read: false,
      ...(dedupeSince ? { createdAt: { gte: dedupeSince } } : {}),
      ...(payload.entity ? { entity: payload.entity } : {}),
      ...(payload.entityId ? { entityId: payload.entityId } : {}),
      ...(payload.link ? { link: payload.link } : {}),
    };
  }

  /** Notifica todos os usuários ativos do tenant com os perfis informados. */
  async notifyRoles(
    tenantId: string,
    roles: Role[],
    payload: NotifyPayload,
  ): Promise<void> {
    const users = await this.findActiveUsersByRoles(tenantId, roles);
    await this.createForUsers(
      tenantId,
      users.map((u) => u.id),
      payload,
    );
  }

  /**
   * Versão idempotente de notifyRoles. Mantém compatibilidade com serviços que
   * precisam disparar alertas recorrentes sem gerar duplicidade.
   */
  async notifyRolesOnce(
    tenantId: string,
    roles: Role[],
    payload: NotifyPayload,
    dedupeSince?: Date,
  ): Promise<void> {
    const users = await this.findActiveUsersByRoles(tenantId, roles);
    await this.createForUsersOnce(
      tenantId,
      users.map((u) => u.id),
      payload,
      dedupeSince,
    );
  }

  private findActiveUsersByRoles(
    tenantId: string,
    roles: Role[],
  ): Promise<Array<{ id: string }>> {
    return this.prisma.user.findMany({
      where: { tenantId, active: true, role: { in: roles } },
      select: { id: true },
    });
  }

  private async sendPush(
    userId: string,
    payload: NotifyPayload,
    notifId: string,
  ): Promise<void> {
    if (!this.pushEnabled) return;
    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });
    const baseLink = payload.link ?? '/notificacoes';
    const link = `${baseLink}${baseLink.includes('?') ? '&' : '?'}notif=${notifId}`;
    const body = JSON.stringify({
      title: payload.title,
      body: payload.body ?? '',
      link,
    });
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await this.prisma.pushSubscription
              .delete({ where: { id: s.id } })
              .catch(() => undefined);
          } else {
            this.logger.warn(`Falha ao enviar push: ${String(err)}`);
          }
        }
      }),
    );
  }

  async list(
    userId: string,
    query: ListNotificationsQuery,
  ): Promise<Paginated<NotificationDto>> {
    const { page, pageSize, unreadOnly } = query;
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(unreadOnly ? { read: false } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map((n) => this.toDto(n)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, read: false } });
  }

  async markRead(userId: string, id: string): Promise<void> {
    const res = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
    if (res.count === 0) throw new NotFoundException('Notificação não encontrada');
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  async subscribePush(userId: string, input: PushSubscribeInput): Promise<void> {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
      },
      update: { userId, p256dh: input.keys.p256dh, auth: input.keys.auth },
    });
  }

  async unsubscribePush(userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  publicKey(): string {
    return this.config.get<string>('VAPID_PUBLIC_KEY') ?? '';
  }
}
