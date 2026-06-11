import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QuoteItemDecision } from '@prisma/client';
import {
  canTransition,
  type GenerateQuoteInput,
  type QuoteDecisionInput,
  type QuoteDto,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MessagingService } from '../messaging/messaging.service';
import { quoteInclude, toQuoteDto } from './quote.mapper';
import { ServiceOrderDomainError } from '../service-orders/domain/service-order.errors';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const dec = (v: Prisma.Decimal | number | null | undefined): number =>
  v == null ? 0 : Number(v);

interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly messaging: MessagingService,
  ) {}

  /** Gera (ou regenera) o orçamento da OS a partir dos itens atuais. */
  async generate(
    actor: AuthenticatedUser,
    orderId: string,
    input: GenerateQuoteInput,
  ): Promise<QuoteDto> {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id: orderId, tenantId: actor.tenantId },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });
    if (!order) throw new NotFoundException('OS não encontrada');
    if (['ENTREGUE', 'CANCELADA'].includes(order.status)) {
      throw new ServiceOrderDomainError(
        'Não é possível gerar orçamento de OS finalizada ou cancelada',
      );
    }
    if (order.items.length === 0) {
      throw new BadRequestException('Adicione itens à OS antes de gerar o orçamento');
    }

    const quote = await this.prisma.$transaction(async (tx) => {
      const q = await tx.quote.upsert({
        where: { serviceOrderId: orderId },
        create: {
          tenantId: actor.tenantId,
          serviceOrderId: orderId,
          status: 'ENVIADO',
          publicNotes: input.publicNotes ?? null,
          totalServices: dec(order.totalServices),
          totalParts: dec(order.totalParts),
          discount: dec(order.discount),
          total: dec(order.total),
        },
        update: {
          status: 'ENVIADO',
          publicNotes: input.publicNotes ?? null,
          totalServices: dec(order.totalServices),
          totalParts: dec(order.totalParts),
          discount: dec(order.discount),
          total: dec(order.total),
          decisionType: null,
          decidedAt: null,
          decisionIp: null,
          decisionUa: null,
          signatureName: null,
        },
      });

      await tx.quoteItem.deleteMany({ where: { quoteId: q.id } });
      // Cria os itens capturando o id de cada um, para reproduzir o vínculo
      // peça→serviço (parentItemId) que existe na OS dentro do orçamento.
      const idMap = new Map<string, string>(); // osItemId -> quoteItemId
      for (const it of order.items) {
        const createdItem = await tx.quoteItem.create({
          data: {
            quoteId: q.id,
            kind: it.kind,
            description: it.description,
            quantity: dec(it.quantity),
            unitPrice: dec(it.unitPrice),
            total: dec(it.total),
          },
        });
        idMap.set(it.id, createdItem.id);
      }
      for (const it of order.items) {
        if (it.parentItemId && idMap.has(it.parentItemId)) {
          await tx.quoteItem.update({
            where: { id: idMap.get(it.id)! },
            data: { parentItemId: idMap.get(it.parentItemId)! },
          });
        }
      }

      // Entrar na etapa de orçamento, se a transição for válida.
      if (canTransition(order.status, 'ORCAMENTO')) {
        await tx.serviceOrder.update({
          where: { id: orderId },
          data: {
            status: 'ORCAMENTO',
            history: {
              create: {
                status: 'ORCAMENTO',
                userId: actor.id,
                note: 'Orçamento enviado',
              },
            },
          },
        });
      }

      return tx.quote.findUniqueOrThrow({
        where: { id: q.id },
        include: quoteInclude,
      });
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'QUOTE_GENERATE',
      module: 'quotes',
      entity: 'Quote',
      entityId: quote.id,
      after: { total: dec(quote.total) },
    });

    await this.messaging.dispatchOrderEvent(actor.tenantId, 'QUOTE_SENT', orderId);

    return toQuoteDto(quote, order.publicToken);
  }

  async getByOrder(
    tenantId: string,
    orderId: string,
  ): Promise<QuoteDto | null> {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id: orderId, tenantId },
      select: { publicToken: true, quote: { include: quoteInclude } },
    });
    if (!order?.quote) return null;
    return toQuoteDto(order.quote, order.publicToken);
  }

  /**
   * Aplica a decisão do cliente (página pública). Resolve a OS pelo token,
   * registra a decisão e, se houver aprovação, avança a OS.
   */
  async applyDecisionByToken(
    token: string,
    input: QuoteDecisionInput,
    meta: RequestMeta,
  ): Promise<QuoteDto> {
    const order = await this.prisma.serviceOrder.findUnique({
      where: { publicToken: token },
      select: {
        id: true,
        number: true,
        tenantId: true,
        status: true,
        publicToken: true,
        quote: { include: quoteInclude },
      },
    });
    if (!order?.quote) throw new NotFoundException('Orçamento não encontrado');

    const quote = order.quote;
    if (quote.status !== 'ENVIADO') {
      throw new ServiceOrderDomainError('Este orçamento já foi respondido');
    }

    const decisionMap = new Map(
      input.itemDecisions.map((d) => [d.itemId, d.decision]),
    );

    // Decisão bruta informada pelo cliente (default = aprovado).
    const raw = new Map<string, 'APROVADO' | 'RECUSADO'>();
    for (const it of quote.items) {
      raw.set(
        it.id,
        input.reject ? 'RECUSADO' : (decisionMap.get(it.id) ?? 'APROVADO'),
      );
    }

    // Cascata: serviço + peças vinculadas formam um grupo (chave = parentItemId
    // ?? id). Se qualquer membro foi recusado, todo o grupo é recusado — assim
    // recusar uma peça recusa o serviço, e recusar o serviço recusa as peças.
    const groupKey = (it: { id: string; parentItemId: string | null }) =>
      it.parentItemId ?? it.id;
    const rejectedGroups = new Set<string>();
    for (const it of quote.items) {
      if (raw.get(it.id) === 'RECUSADO') rejectedGroups.add(groupKey(it));
    }

    let approved = 0;
    let refused = 0;
    const updates = quote.items.map((it) => {
      const decision: QuoteItemDecision = rejectedGroups.has(groupKey(it))
        ? QuoteItemDecision.RECUSADO
        : QuoteItemDecision.APROVADO;
      if (decision === QuoteItemDecision.APROVADO) approved++;
      else refused++;
      return { id: it.id, decision };
    });

    const decisionType =
      input.reject || approved === 0
        ? 'RECUSA'
        : refused === 0
          ? 'TOTAL'
          : 'PARCIAL';
    const status =
      decisionType === 'RECUSA'
        ? 'RECUSADO'
        : decisionType === 'TOTAL'
          ? 'APROVADO'
          : 'APROVADO_PARCIAL';

    await this.prisma.$transaction(async (tx) => {
      for (const u of updates) {
        await tx.quoteItem.update({
          where: { id: u.id },
          data: { decision: u.decision },
        });
      }
      await tx.quote.update({
        where: { id: quote.id },
        data: {
          status,
          decisionType,
          decidedAt: new Date(),
          decisionIp: meta.ip ?? null,
          decisionUa: meta.userAgent ?? null,
          signatureName: input.signatureName ?? null,
        },
      });

      // Aprovação (total ou parcial) avança a OS.
      if (approved > 0 && canTransition(order.status, 'ORCAMENTO_APROVADO')) {
        await tx.serviceOrder.update({
          where: { id: order.id },
          data: {
            status: 'ORCAMENTO_APROVADO',
            history: {
              create: {
                status: 'ORCAMENTO_APROVADO',
                note:
                  decisionType === 'TOTAL'
                    ? 'Orçamento aprovado pelo cliente'
                    : 'Orçamento aprovado parcialmente pelo cliente',
              },
            },
          },
        });
      }
    });

    await this.audit.record({
      tenantId: order.tenantId,
      action: 'QUOTE_DECISION',
      module: 'quotes',
      entity: 'Quote',
      entityId: quote.id,
      after: { decisionType, ip: meta.ip, signature: input.signatureName },
    });

    await this.notifications.notifyRoles(
      order.tenantId,
      ['ADMIN', 'ATENDENTE'],
      {
        type: 'QUOTE_DECISION',
        title:
          decisionType === 'RECUSA'
            ? `Orçamento da OS #${order.number} recusado`
            : `Orçamento da OS #${order.number} aprovado${decisionType === 'PARCIAL' ? ' (parcial)' : ''}`,
        body: input.signatureName
          ? `Resposta do cliente · ${input.signatureName}`
          : 'O cliente respondeu o orçamento.',
        link: `/os/${order.id}`,
        entity: 'ServiceOrder',
        entityId: order.id,
      },
    );

    if (approved > 0) {
      await this.messaging.dispatchOrderEvent(
        order.tenantId,
        'QUOTE_APPROVED',
        order.id,
      );
    }

    const fresh = await this.prisma.quote.findUniqueOrThrow({
      where: { id: quote.id },
      include: quoteInclude,
    });
    return toQuoteDto(fresh, order.publicToken);
  }
}
