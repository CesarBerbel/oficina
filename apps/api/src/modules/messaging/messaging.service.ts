import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type MessageChannel, type MessageEvent, type MessageStatus } from '@prisma/client';
import type {
  CreateTemplateInput,
  ListMessagesQuery,
  MessageLogDto,
  MessageTemplateDto,
  MailStatusDto,
  Paginated,
  SendMessageInput,
  SendTestEmailResult,
  UpdateTemplateInput,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MailService } from '../../infra/mail/mail.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const dec = (v: Prisma.Decimal | number | null | undefined): number => (v == null ? 0 : Number(v));
const brl = (n: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  private isUniqueConstraintError(err: unknown): boolean {
    return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
  }

  // ─── Templates ───
  private toTemplate(t: Prisma.MessageTemplateGetPayload<object>): MessageTemplateDto {
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
        .reduce<unknown>(
          (acc, key) => (acc == null ? undefined : (acc as Record<string, unknown>)[key]),
          ctx,
        );
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
        cliente: {
          nome: order.customer.name,
          telefone: order.customer.phone ?? order.customer.whatsapp ?? '',
        },
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

  // ─── Canal ───
  // E-mail é entregue via SMTP (MailService) quando configurado; WhatsApp/SMS
  // seguem simulados (adapter mock/log) até integrarmos um provider.
  private async deliver(
    channel: MessageChannel,
    to: string,
    body: string,
    subject?: string,
    html?: string,
  ): Promise<{ status: MessageStatus; error: string | null }> {
    if (channel === 'EMAIL' && this.mail.enabled) {
      if (!to) {
        return { status: 'FALHA', error: 'Destinatário de e-mail ausente' };
      }
      const res = await this.mail.send({
        to,
        subject: subject ?? this.config.get<string>('APP_NAME') ?? 'Oficina',
        text: body,
        html,
      });
      if (res.skipped) {
        this.logger.log(`[EMAIL:simulado] -> ${to}: ${body.slice(0, 80)}`);
        return { status: 'SIMULADO', error: null };
      }
      return {
        status: res.ok ? 'ENVIADO' : 'FALHA',
        error: res.error,
      };
    }
    this.logger.log(`[${channel}] -> ${to}: ${body.slice(0, 80)}`);
    return { status: 'SIMULADO', error: null };
  }

  /** Dispara mensagens automáticas configuradas para um evento de uma OS. */
  async dispatchOrderEvent(
    tenantId: string,
    event: MessageEvent,
    orderId: string,
    dispatchKeyBase?: string,
  ): Promise<void> {
    const templates = await this.prisma.messageTemplate.findMany({
      where: { tenantId, event, active: true, autoSend: true },
    });
    if (templates.length === 0) return;

    const built = await this.contextForOrder(tenantId, orderId);
    if (!built) return;

    for (const t of templates) {
      const dispatchKey = dispatchKeyBase ? `${dispatchKeyBase}:template:${t.id}` : null;
      if (dispatchKey) {
        const already = await this.prisma.messageLog.findUnique({
          where: { dispatchKey },
          select: { id: true },
        });
        if (already) continue;
      }

      const body = this.render(t.body, built.ctx);
      const to =
        t.channel === 'EMAIL'
          ? (built.order.customer.email ?? '')
          : (built.order.customer.phone ?? built.order.customer.whatsapp ?? '');
      const subject = `${built.ctx.oficina.nome} — OS #${built.ctx.os.numero}`;
      const res = await this.deliver(t.channel, to, body, subject);
      try {
        await this.prisma.messageLog.create({
          data: {
            tenantId,
            templateId: t.id,
            customerId: built.order.customerId,
            serviceOrderId: orderId,
            channel: t.channel,
            event,
            dispatchKey,
            status: res.status,
            to,
            body,
            error: res.error,
          },
        });
      } catch (err) {
        if (!this.isUniqueConstraintError(err)) throw err;
        // Outro worker já registrou este dispatch. O handler é idempotente.
      }
    }
  }

  /** Dispara a mensagem de aniversário (CUSTOMER_BIRTHDAY) para um cliente. */
  async dispatchCustomerBirthday(tenantId: string, customerId: string): Promise<void> {
    const templates = await this.prisma.messageTemplate.findMany({
      where: { tenantId, event: 'CUSTOMER_BIRTHDAY', active: true, autoSend: true },
    });
    if (templates.length === 0) return;

    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId },
      select: { id: true, name: true, phone: true, whatsapp: true, email: true },
    });
    if (!customer) return;

    // Idempotência: não reenvia se já houve disparo de aniversário hoje.
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const already = await this.prisma.messageLog.findFirst({
      where: {
        tenantId,
        customerId,
        event: 'CUSTOMER_BIRTHDAY',
        createdAt: { gte: startOfDay },
      },
    });
    if (already) return;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    const ctx = {
      cliente: {
        nome: customer.name,
        telefone: customer.phone ?? customer.whatsapp ?? '',
      },
      oficina: { nome: tenant?.name ?? 'Oficina' },
    };

    for (const t of templates) {
      const body = this.render(t.body, ctx);
      const to =
        t.channel === 'EMAIL'
          ? (customer.email ?? '')
          : (customer.phone ?? customer.whatsapp ?? '');
      const res = await this.deliver(
        t.channel,
        to,
        body,
        `${ctx.oficina.nome} — Feliz aniversário!`,
      );
      await this.prisma.messageLog.create({
        data: {
          tenantId,
          templateId: t.id,
          customerId: customer.id,
          channel: t.channel,
          event: 'CUSTOMER_BIRTHDAY',
          status: res.status,
          to,
          body,
          error: res.error,
        },
      });
    }
  }

  /**
   * Envia o link do orçamento para o e-mail do cliente da OS. Usa um template
   * de e-mail ativo para QUOTE_SENT, se houver; caso contrário, um corpo padrão.
   */
  async sendQuoteEmail(tenantId: string, orderId: string): Promise<{ to: string }> {
    const built = await this.contextForOrder(tenantId, orderId);
    if (!built) throw new NotFoundException('OS não encontrada');

    const to = built.order.customer.email?.trim() ?? '';
    if (!to) {
      throw new BadRequestException('Cliente não possui e-mail cadastrado');
    }

    const template = await this.prisma.messageTemplate.findFirst({
      where: { tenantId, event: 'QUOTE_SENT', channel: 'EMAIL', active: true },
    });
    const body = template
      ? this.render(template.body, built.ctx)
      : `Olá ${built.ctx.cliente.nome}, o orçamento da OS #${built.ctx.os.numero} ` +
        `(${built.ctx.veiculo.modelo} · ${built.ctx.veiculo.placa}) está pronto. ` +
        `Acesse o link para consultar a OS, ver a timeline e aprovar online: ${built.ctx.os.link}`;

    const res = await this.deliver(
      'EMAIL',
      to,
      body,
      `Orçamento da OS #${built.ctx.os.numero} — ${built.ctx.oficina.nome}`,
    );
    await this.prisma.messageLog.create({
      data: {
        tenantId,
        templateId: template?.id ?? null,
        customerId: built.order.customerId,
        serviceOrderId: orderId,
        channel: 'EMAIL',
        event: 'QUOTE_SENT',
        status: res.status,
        to,
        body,
        error: res.error,
      },
    });
    return { to };
  }

  /**
   * Envia o código de acesso da área do cliente (consulta de histórico) por
   * e-mail e registra no log de mensagens.
   */
  async sendGarageAccessCode(
    tenantId: string,
    params: {
      to: string;
      code: string;
      customerName: string;
      plate: string;
      vehicleLabel: string;
      customerId: string;
    },
  ): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    const shop = tenant?.name ?? 'Oficina';
    const webOrigin = this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000';
    const link = `${webOrigin}/site/consulta?placa=${encodeURIComponent(params.plate)}`;
    const veiculo = `${params.plate} - ${params.vehicleLabel}`;

    const body =
      `Olá, ${params.customerName}.\n\n` +
      `Recebemos uma solicitação para acessar a área privada do veículo ${veiculo}.\n\n` +
      `Use o código abaixo para confirmar o acesso:\n\n` +
      `${params.code}\n\n` +
      `O código é válido por 5 horas.\n\n` +
      `Para informar o código, acesse:\n${link}\n\n` +
      `Se você não solicitou esse acesso, ignore este e-mail.`;

    const html = this.garageCodeHtml({
      customerName: params.customerName,
      veiculo,
      code: params.code,
      link,
    });

    const res = await this.deliver(
      'EMAIL',
      params.to,
      body,
      `${shop} — código de acesso ${params.code}`,
      html,
    );
    await this.prisma.messageLog.create({
      data: {
        tenantId,
        customerId: params.customerId,
        channel: 'EMAIL',
        event: 'MANUAL',
        status: res.status,
        to: params.to,
        body,
        error: res.error,
      },
    });
  }

  /** Escapa texto para inserção segura em HTML de e-mail. */
  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Monta o corpo HTML do e-mail de código de acesso da área do cliente. */
  private garageCodeHtml(params: {
    customerName: string;
    veiculo: string;
    code: string;
    link: string;
  }): string {
    const name = this.escapeHtml(params.customerName);
    const veiculo = this.escapeHtml(params.veiculo);
    const link = this.escapeHtml(params.link);
    return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;max-width:560px;">
  <p>Olá, ${name}.</p>
  <p>Recebemos uma solicitação para acessar a área privada do veículo <strong>${veiculo}</strong>.</p>
  <p>Use o código abaixo para confirmar o acesso:</p>
  <p style="font-size:30px;font-weight:bold;letter-spacing:10px;margin:18px 0;color:#111827;">${params.code}</p>
  <p>O código é válido por <strong>5 horas</strong>.</p>
  <p>Para informar o código, acesse:</p>
  <p><a href="${link}" style="color:#2563eb;word-break:break-all;">${link}</a></p>
  <p style="color:#6b7280;">Se você não solicitou esse acesso, ignore este e-mail.</p>
</div>`;
  }

  /** Estado atual do canal de e-mail (modo SMTP/log e remetente). */
  mailStatus(): MailStatusDto {
    return { mode: this.mail.mode, from: this.mail.fromAddress };
  }

  /** Envia um e-mail de teste para validar a configuração de envio (SMTP/log). */
  async sendTestEmail(actor: AuthenticatedUser, to: string): Promise<SendTestEmailResult> {
    const body =
      'Este é um e-mail de teste do sistema da oficina. ' +
      'Se você recebeu esta mensagem, o envio por e-mail está funcionando.';
    const res = await this.deliver('EMAIL', to, body, 'Teste de e-mail — Oficina');
    await this.prisma.messageLog.create({
      data: {
        tenantId: actor.tenantId,
        channel: 'EMAIL',
        event: 'MANUAL',
        status: res.status,
        to,
        body,
        error: res.error,
      },
    });
    return { status: res.status, mode: this.mail.mode, error: res.error };
  }

  /** Envio manual a partir do painel. */
  async sendManual(actor: AuthenticatedUser, input: SendMessageInput): Promise<MessageLogDto> {
    let body = input.body;
    let to = input.to ?? '';
    const event: MessageEvent = 'MANUAL';

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

  async listLogs(tenantId: string, query: ListMessagesQuery): Promise<Paginated<MessageLogDto>> {
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
