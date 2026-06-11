import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type MessageChannel, type MessageEvent } from '@prisma/client';
import type {
  CreateTemplateInput,
  ListMessagesQuery,
  MessageLogDto,
  MessageTemplateDto,
  Paginated,
  SendMessageInput,
  UpdateTemplateInput,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const dec = (v: Prisma.Decimal | number | null | undefined): number =>
  v == null ? 0 : Number(v);
const brl = (n: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ─── Templates ───
  private toTemplate(
    t: Prisma.MessageTemplateGetPayload<object>,
  ): MessageTemplateDto {
    return {
      id: t.id,
      name: t.name,
      event: t.event,
      channel: t.channel,
      body: t.body,
      active: t.active,
      autoSend: t.autoSend,
    };
  }

  async listTemplates(tenantId: string): Promise<MessageTemplateDto[]> {
    const rows = await this.prisma.messageTemplate.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
    return rows.map((t) => this.toTemplate(t));
  }

  async createTemplate(
    actor: AuthenticatedUser,
    input: CreateTemplateInput,
  ): Promise<MessageTemplateDto> {
    const t = await this.prisma.messageTemplate.create({
      data: { tenantId: actor.tenantId, ...input },
    });
    return this.toTemplate(t);
  }

  async updateTemplate(
    actor: AuthenticatedUser,
    id: string,
    input: UpdateTemplateInput,
  ): Promise<MessageTemplateDto> {
    const current = await this.prisma.messageTemplate.findFirst({
      where: { id, tenantId: actor.tenantId },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('Template não encontrado');
    const t = await this.prisma.messageTemplate.update({ where: { id }, data: input });
    return this.toTemplate(t);
  }

  async removeTemplate(actor: AuthenticatedUser, id: string): Promise<void> {
    await this.prisma.messageTemplate.deleteMany({
      where: { id, tenantId: actor.tenantId },
    });
  }

  // ─── Render ───
  private render(body: string, ctx: Record<string, unknown>): string {
    return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
      const value = path
        .split('.')
        .reduce<unknown>((acc, key) => (acc == null ? undefined : (acc as Record<string, unknown>)[key]), ctx);
      return value == null ? '' : String(value);
    });
  }

  private async contextForOrder(tenantId: string, orderId: string) {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id: orderId, tenantId },
      include: {
        customer: { select: { name: true, phone: true, whatsapp: true, email: true } },
        vehicle: { select: { plate: true, manufacturer: true, model: true } },
        tenant: { select: { name: true } },
      },
    });
    if (!order) return null;
    const webOrigin = this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000';
    return {
      order,
      ctx: {
        cliente: { nome: order.customer.name, telefone: order.customer.phone ?? order.customer.whatsapp ?? '' },
        os: {
          numero: order.number,
          status: order.status,
          total: brl(dec(order.total)),
          link: `${webOrigin}/acompanhar/${order.publicToken}`,
        },
        veiculo: {
          placa: order.vehicle.plate,
          modelo: `${order.vehicle.manufacturer} ${order.vehicle.model}`,
        },
        oficina: { nome: order.tenant.name },
      },
    };
  }

  // ─── Canal (adapter mock — registra/loga; provider real no futuro) ───
  private async deliver(channel: MessageChannel, to: string, body: string) {
    this.logger.log(`[${channel}] -> ${to}: ${body.slice(0, 80)}`);
    return { status: 'SIMULADO' as const, error: null as string | null };
  }

  /** Dispara mensagens automáticas configuradas para um evento de uma OS. */
  async dispatchOrderEvent(
    tenantId: string,
    event: MessageEvent,
    orderId: string,
  ): Promise<void> {
    const templates = await this.prisma.messageTemplate.findMany({
      where: { tenantId, event, active: true, autoSend: true },
    });
    if (templates.length === 0) return;

    const built = await this.contextForOrder(tenantId, orderId);
    if (!built) return;

    for (const t of templates) {
      const body = this.render(t.body, built.ctx);
      const to =
        t.channel === 'EMAIL'
          ? (built.order.customer.email ?? '')
          : (built.order.customer.phone ?? built.order.customer.whatsapp ?? '');
      const res = await this.deliver(t.channel, to, body);
      await this.prisma.messageLog.create({
        data: {
          tenantId,
          templateId: t.id,
          customerId: built.order.customerId,
          serviceOrderId: orderId,
          channel: t.channel,
          event,
          status: res.status,
          to,
          body,
          error: res.error,
        },
      });
    }
  }

  /** Envio manual a partir do painel. */
  async sendManual(
    actor: AuthenticatedUser,
    input: SendMessageInput,
  ): Promise<MessageLogDto> {
    let body = input.body;
    let to = input.to ?? '';
    let event: MessageEvent = 'MANUAL';

    if (input.serviceOrderId) {
      const built = await this.contextForOrder(actor.tenantId, input.serviceOrderId);
      if (built) {
        body = this.render(body, built.ctx);
        if (!to) {
          to =
            input.channel === 'EMAIL'
              ? (built.order.customer.email ?? '')
              : (built.order.customer.phone ?? built.order.customer.whatsapp ?? '');
        }
      }
    } else if (input.customerId && !to) {
      const c = await this.prisma.customer.findFirst({
        where: { id: input.customerId, tenantId: actor.tenantId },
        select: { phone: true, whatsapp: true, email: true },
      });
      if (c) to = input.channel === 'EMAIL' ? (c.email ?? '') : (c.phone ?? c.whatsapp ?? '');
    }

    const res = await this.deliver(input.channel, to, body);
    const log = await this.prisma.messageLog.create({
      data: {
        tenantId: actor.tenantId,
        templateId: input.templateId ?? null,
        customerId: input.customerId ?? null,
        serviceOrderId: input.serviceOrderId ?? null,
        channel: input.channel,
        event,
        status: res.status,
        to,
        body,
        error: res.error,
      },
      include: { customer: { select: { name: true } } },
    });
    return this.toLog(log);
  }

  private toLog(
    l: Prisma.MessageLogGetPayload<{ include: { customer: { select: { name: true } } } }>,
  ): MessageLogDto {
    return {
      id: l.id,
      channel: l.channel,
      event: l.event,
      status: l.status,
      to: l.to,
      body: l.body,
      error: l.error,
      customerName: l.customer?.name ?? null,
      createdAt: l.createdAt.toISOString(),
    };
  }

  async listLogs(
    tenantId: string,
    query: ListMessagesQuery,
  ): Promise<Paginated<MessageLogDto>> {
    const { page, pageSize } = query;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.messageLog.count({ where: { tenantId } }),
      this.prisma.messageLog.findMany({
        where: { tenantId },
        include: { customer: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map((l) => this.toLog(l)),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }
}
