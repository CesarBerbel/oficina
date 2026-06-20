import {
  BadRequestException,
  ConflictException,
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
import { OutboxService } from '../outbox/outbox.service';
import { quoteInclude, toQuoteDto, type QuoteRow } from './quote.mapper';
import { ServiceOrderDomainError } from '../service-orders/domain/service-order.errors';
import { PurchasesService } from '../purchases/purchases.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { publicTokenExpiresAt } from '../../common/utils/public-token';

const dec = (v: Prisma.Decimal | number | null | undefined): number => (v == null ? 0 : Number(v));
const round2 = (n: number): number => Math.round(n * 100) / 100;
const brl = (n: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const clampPercent = (n: number): number => round2(Math.min(100, Math.max(0, n)));

interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

class QuoteAlreadyDecidedError extends Error {
  constructor() {
    super('Este orçamento já foi respondido');
    this.name = 'QuoteAlreadyDecidedError';
  }
}

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly messaging: MessagingService,
    private readonly purchases: PurchasesService,
    private readonly outbox: OutboxService,
  ) {}

  /** Gera (ou regenera) o orçamento da OS a partir dos itens atuais. */
  async generate(
    actor: AuthenticatedUser,
    orderId: string,
    input: GenerateQuoteInput,
  ): Promise<QuoteDto> {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id: orderId, tenantId: actor.tenantId },
      include: {
        items: { orderBy: { createdAt: 'asc' } },
        quote: { select: { sendCount: true } },
      },
    });
    if (!order) throw new NotFoundException('OS não encontrada');
    if (order.status === 'ENTRADA') {
      throw new ServiceOrderDomainError('Conclua o diagnóstico antes de gerar o orçamento.');
    }
    // Orçamento só pode ser gerado/regerado a partir do diagnóstico pronto,
    // enquanto está em orçamento, ou após uma recusa (novo orçamento).
    const ALLOWED_GENERATE_STATUSES = ['DIAGNOSTICO_PRONTO', 'ORCAMENTO', 'ORCAMENTO_RECUSADO'];
    if (!ALLOWED_GENERATE_STATUSES.includes(order.status)) {
      throw new ServiceOrderDomainError('Não é possível gerar orçamento neste estágio da OS.');
    }
    if (order.items.length === 0) {
      throw new BadRequestException('Adicione itens à OS antes de gerar o orçamento');
    }

    // A partir do 2º envio (reenvio), exige um motivo.
    const prevSendCount = order.quote?.sendCount ?? 0;
    const isResend = prevSendCount >= 1;
    if (isResend && !input.reason) {
      throw new BadRequestException('Informe o motivo do reenvio do orçamento.');
    }

    const quoteItems = order.items.map((it) => {
      const quantity = dec(it.quantity);
      const unitPrice = dec(it.unitPrice);
      const subtotal = round2(quantity * unitPrice);
      // O desconto por item vem do próprio item da OS (definido na lista de itens).
      const discountPercent = clampPercent(dec(it.discountPercent));
      const discountAmount = round2((subtotal * discountPercent) / 100);
      return {
        item: it,
        quantity,
        unitPrice,
        discountPercent,
        discountAmount,
        total: Math.max(0, round2(subtotal - discountAmount)),
      };
    });
    const quoteTotalServices = round2(
      quoteItems.filter((it) => it.item.kind === 'SERVICE').reduce((sum, it) => sum + it.total, 0),
    );
    const quoteTotalParts = round2(
      quoteItems.filter((it) => it.item.kind === 'PART').reduce((sum, it) => sum + it.total, 0),
    );
    const quoteDiscount = dec(order.discount);
    const quoteTotal = Math.max(0, round2(quoteTotalServices + quoteTotalParts - quoteDiscount));

    const quote = await this.prisma.$transaction(async (tx) => {
      const q = await tx.quote.upsert({
        where: { serviceOrderId: orderId },
        create: {
          tenantId: actor.tenantId,
          serviceOrderId: orderId,
          status: 'ENVIADO',
          sendCount: 1,
          publicNotes: input.publicNotes ?? null,
          totalServices: quoteTotalServices,
          totalParts: quoteTotalParts,
          discount: quoteDiscount,
          total: quoteTotal,
        },
        update: {
          status: 'ENVIADO',
          sendCount: { increment: 1 },
          publicNotes: input.publicNotes ?? null,
          totalServices: quoteTotalServices,
          totalParts: quoteTotalParts,
          discount: quoteDiscount,
          total: quoteTotal,
          decisionType: null,
          decidedAt: null,
          decisionIp: null,
          decisionUa: null,
          signatureName: null,
          signatureDoc: null,
        },
      });

      await tx.quoteItem.deleteMany({ where: { quoteId: q.id } });
      // Cria os itens capturando o id de cada um, para reproduzir o vínculo
      // peça→serviço (parentItemId) que existe na OS dentro do orçamento.
      const idMap = new Map<string, string>(); // osItemId -> quoteItemId
      for (const quoteItem of quoteItems) {
        const it = quoteItem.item;
        const createdItem = await tx.quoteItem.create({
          data: {
            quoteId: q.id,
            kind: it.kind,
            description: it.description,
            quantity: quoteItem.quantity,
            unitPrice: quoteItem.unitPrice,
            discountPercent: quoteItem.discountPercent,
            discountAmount: quoteItem.discountAmount,
            total: quoteItem.total,
            serviceOrderItemId: it.id,
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

      // Entrar na etapa de orçamento, se a transição for válida; caso já esteja
      // em orçamento, mantém o status. Em ambos os casos registra a versão do
      // orçamento no histórico da OS (com o valor), para manter o histórico de
      // todos os orçamentos gerados.
      const movingToQuote = canTransition(order.status, 'ORCAMENTO');
      const historyStatus = movingToQuote ? 'ORCAMENTO' : order.status;
      const note = [
        `${isResend ? 'Orçamento reenviado' : 'Orçamento enviado'} · ${brl(quoteTotal)}`,
        isResend && input.reason ? `Motivo: ${input.reason}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      await tx.serviceOrder.update({
        where: { id: orderId },
        data: {
          status: historyStatus,
          publicTokenExpiresAt: publicTokenExpiresAt(),
          history: {
            create: {
              status: historyStatus,
              userId: actor.id,
              note,
            },
          },
        },
      });
      await tx.serviceOrderEvent.create({
        data: {
          tenantId: actor.tenantId,
          serviceOrderId: orderId,
          type: 'STATUS_CHANGE',
          title: isResend ? 'Orçamento reenviado' : 'Orçamento enviado',
          description: note,
          visibility: 'PUBLIC',
          fromStatus: order.status,
          toStatus: historyStatus,
          createdById: actor.id,
        },
      });

      // Mensagem de orçamento enviado via outbox (atômico com a geração).
      await this.outbox.enqueueOrderEvent(
        tx,
        actor.tenantId,
        'QUOTE_SENT',
        orderId,
        `quote:${q.id}:send:${q.sendCount}`,
      );

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

    return toQuoteDto(quote, order.publicToken);
  }

  /**
   * Reabre o orçamento de uma OS aprovada: volta para "diagnóstico pronto",
   * destravando a edição de itens (serviços, combos, peças) e permitindo gerar
   * um novo orçamento. Registra a reabertura no histórico da OS.
   */
  async reopen(actor: AuthenticatedUser, orderId: string): Promise<QuoteDto | null> {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id: orderId, tenantId: actor.tenantId },
      select: { id: true, status: true },
    });
    if (!order) throw new NotFoundException('OS não encontrada');
    if (order.status !== 'ORCAMENTO_APROVADO' && order.status !== 'AGUARDANDO_PECA') {
      throw new ServiceOrderDomainError(
        'Só é possível reabrir o orçamento de uma OS aprovada ou aguardando peça.',
      );
    }
    if (!canTransition(order.status, 'DIAGNOSTICO_PRONTO')) {
      throw new ServiceOrderDomainError('Não é possível reabrir o orçamento neste estágio da OS.');
    }

    await this.prisma.$transaction(async (tx) => {
      // Libera a reserva de estoque e cancela pedidos de compra em aberto da OS.
      await this.purchases.unwindOrderBackorder(tx, orderId);
      await tx.serviceOrder.update({
        where: { id: orderId },
        data: {
          status: 'DIAGNOSTICO_PRONTO',
          history: {
            create: {
              status: 'DIAGNOSTICO_PRONTO',
              userId: actor.id,
              note: 'Orçamento reaberto para novo orçamento',
            },
          },
        },
      });
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'QUOTE_REOPEN',
      module: 'quotes',
      entity: 'ServiceOrder',
      entityId: orderId,
      before: { status: 'ORCAMENTO_APROVADO' },
      after: { status: 'DIAGNOSTICO_PRONTO' },
    });

    return this.getByOrder(actor.tenantId, orderId);
  }

  /**
   * Gera o pedido de compra das peças aprovadas que estão em falta (sob demanda,
   * via botão). Disponível após a aprovação do orçamento.
   */
  async generatePurchase(actor: AuthenticatedUser, orderId: string): Promise<{ created: number }> {
    return this.purchases.generatePurchaseForOrder(actor, orderId);
  }

  /** Envia o link do orçamento para o e-mail do cliente. */
  async sendEmail(actor: AuthenticatedUser, orderId: string): Promise<{ to: string }> {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id: orderId, tenantId: actor.tenantId },
      select: { id: true, quote: { select: { id: true, status: true } } },
    });
    if (!order) throw new NotFoundException('OS não encontrada');
    if (!order.quote) {
      throw new BadRequestException('Gere o orçamento antes de enviar por e-mail');
    }
    // Orçamento aprovado não pode ser reenviado.
    if (order.quote.status === 'APROVADO' || order.quote.status === 'APROVADO_PARCIAL') {
      throw new BadRequestException('Orçamento já aprovado — não pode ser reenviado.');
    }

    const res = await this.messaging.sendQuoteEmail(actor.tenantId, orderId);

    await this.prisma.$transaction(async (tx) => {
      await tx.serviceOrder.update({
        where: { id: orderId },
        data: { publicTokenExpiresAt: publicTokenExpiresAt() },
      });
      await tx.serviceOrderEvent.create({
        data: {
          tenantId: actor.tenantId,
          serviceOrderId: orderId,
          type: 'STATUS_CHANGE',
          title: 'E-mail de orçamento enviado',
          description: `Link do orçamento enviado para ${res.to}`,
          visibility: 'PUBLIC',
        },
      });
    });

    await this.notifications.notifyRoles(actor.tenantId, ['ADMIN', 'ATENDENTE'], {
      type: 'QUOTE_SENT',
      title: 'Orçamento enviado por e-mail',
      body: `OS com link de aprovação enviado para ${res.to}.`,
      link: `/os/${orderId}`,
      entity: 'ServiceOrder',
      entityId: orderId,
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'QUOTE_SEND_EMAIL',
      module: 'quotes',
      entity: 'Quote',
      entityId: order.quote.id,
      after: { to: res.to },
    });

    return res;
  }

  async getByOrder(tenantId: string, orderId: string): Promise<QuoteDto | null> {
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
        publicTokenExpiresAt: true,
        quote: { include: quoteInclude },
      },
    });
    if (!order?.quote) throw new NotFoundException('Orçamento não encontrado');
    if (order.publicTokenExpiresAt && order.publicTokenExpiresAt < new Date()) {
      throw new NotFoundException('Link do orçamento expirado');
    }

    const quote = order.quote;
    if (quote.status !== 'ENVIADO') {
      // Idempotência pública: respostas repetidas ao mesmo link retornam o
      // orçamento já decidido, sem reexecutar efeitos colaterais.
      return toQuoteDto(quote, order.publicToken);
    }

    const decisionMap = new Map(input.itemDecisions.map((d) => [d.itemId, d.decision]));

    // Decisão bruta informada pelo cliente (default = aprovado).
    const raw = new Map<string, 'APROVADO' | 'RECUSADO'>();
    for (const it of quote.items) {
      raw.set(it.id, input.reject ? 'RECUSADO' : (decisionMap.get(it.id) ?? 'APROVADO'));
    }

    // Cascata: serviço + peças vinculadas formam um grupo (chave = parentItemId
    // ?? id). Se qualquer membro foi recusado, todo o grupo é recusado — assim
    // recusar uma peça recusa o serviço, e recusar o serviço recusa as peças.
    const groupKey = (it: { id: string; parentItemId: string | null }) => it.parentItemId ?? it.id;
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

    // Itens da OS correspondentes aos itens recusados — serão removidos da OS
    // (e dos totais) quando houver aprovação parcial.
    const rejectedOrderItemIds = quote.items
      .filter((it) => rejectedGroups.has(groupKey(it)) && it.serviceOrderItemId)
      .map((it) => it.serviceOrderItemId as string);

    const decisionType =
      input.reject || approved === 0 ? 'RECUSA' : refused === 0 ? 'TOTAL' : 'PARCIAL';
    const status =
      decisionType === 'RECUSA'
        ? 'RECUSADO'
        : decisionType === 'TOTAL'
          ? 'APROVADO'
          : 'APROVADO_PARCIAL';

    try {
      await this.prisma.$transaction(async (tx) => {
        // Claim atômico do orçamento. Em concorrência, apenas uma requisição
        // consegue trocar ENVIADO → decidido; as demais retornam o estado já
        // persistido sem duplicar timeline/reserva/outbox.
        const claimed = await tx.quote.updateMany({
          where: { id: quote.id, status: 'ENVIADO' },
          data: {
            status,
            decisionType,
            decidedAt: new Date(),
            decisionIp: meta.ip ?? null,
            decisionUa: meta.userAgent ?? null,
            signatureName: input.signatureName,
            signatureDoc: input.signatureDoc,
          },
        });
        if (claimed.count !== 1) {
          throw new QuoteAlreadyDecidedError();
        }

        for (const u of updates) {
          await tx.quoteItem.updateMany({
            where: { id: u.id, quoteId: quote.id },
            data: { decision: u.decision },
          });
        }

        if (approved === 0) {
          // Recusa total: a OS vai para "recusado", de onde é possível gerar
          // um novo orçamento.
          if (canTransition(order.status, 'ORCAMENTO_RECUSADO')) {
            const moved = await tx.serviceOrder.updateMany({
              where: { id: order.id, tenantId: order.tenantId, status: order.status },
              data: { status: 'ORCAMENTO_RECUSADO' },
            });
            if (moved.count !== 1) {
              throw new ConflictException(
                'A OS foi alterada por outra operação. Recarregue e tente novamente.',
              );
            }
            await tx.serviceOrderStatusHistory.create({
              data: {
                serviceOrderId: order.id,
                status: 'ORCAMENTO_RECUSADO',
                note: 'Orçamento recusado pelo cliente',
              },
            });
            await tx.serviceOrderEvent.create({
              data: {
                tenantId: order.tenantId,
                serviceOrderId: order.id,
                type: 'STATUS_CHANGE',
                title: 'Orçamento recusado',
                description: 'Orçamento recusado pelo cliente',
                visibility: 'PUBLIC',
                fromStatus: order.status,
                toStatus: 'ORCAMENTO_RECUSADO',
              },
            });
          }
        } else {
          // Aprovação parcial: remove da OS os itens recusados (nada foi baixado
          // do estoque ainda) e recalcula os totais para refletir só o aprovado.
          if (rejectedOrderItemIds.length > 0) {
            await tx.serviceOrderItem.deleteMany({
              where: {
                id: { in: rejectedOrderItemIds },
                serviceOrderId: order.id,
              },
            });
          }
          await this.applyApprovedQuoteTotals(tx, order.id, quote, rejectedGroups);

          // Reserva o estoque das peças aprovadas e verifica se faltou estoque.
          // Com falta → "aguardando peça" (o pedido de compra é gerado pelo botão);
          // tudo coberto → "aprovado".
          const { shortfall } = await this.purchases.commitApprovalReservation(
            tx,
            order.tenantId,
            order.id,
          );
          const target = shortfall ? 'AGUARDANDO_PECA' : 'ORCAMENTO_APROVADO';
          if (canTransition(order.status, target)) {
            const note = shortfall
              ? 'Orçamento aprovado — aguardando peça (gere o pedido de compra)'
              : decisionType === 'TOTAL'
                ? 'Orçamento aprovado pelo cliente'
                : 'Orçamento aprovado parcialmente pelo cliente';
            const moved = await tx.serviceOrder.updateMany({
              where: { id: order.id, tenantId: order.tenantId, status: order.status },
              data: { status: target },
            });
            if (moved.count !== 1) {
              throw new ConflictException(
                'A OS foi alterada por outra operação. Recarregue e tente novamente.',
              );
            }
            await tx.serviceOrderStatusHistory.create({
              data: { serviceOrderId: order.id, status: target, note },
            });
            await tx.serviceOrderEvent.create({
              data: {
                tenantId: order.tenantId,
                serviceOrderId: order.id,
                type: 'STATUS_CHANGE',
                title: shortfall ? 'Orçamento aprovado com falta de peça' : 'Orçamento aprovado',
                description: note,
                visibility: 'PUBLIC',
                fromStatus: order.status,
                toStatus: target,
              },
            });
          }

          await this.outbox.enqueueOrderEvent(tx, order.tenantId, 'QUOTE_APPROVED', order.id);
        }
      });
    } catch (err) {
      if (err instanceof QuoteAlreadyDecidedError) {
        const fresh = await this.prisma.quote.findUniqueOrThrow({
          where: { id: quote.id },
          include: quoteInclude,
        });
        return toQuoteDto(fresh, order.publicToken);
      }
      throw err;
    }

    await this.audit.record({
      tenantId: order.tenantId,
      action: 'QUOTE_DECISION',
      module: 'quotes',
      entity: 'Quote',
      entityId: quote.id,
      after: {
        decisionType,
        ip: meta.ip,
        signature: input.signatureName,
        document: input.signatureDoc,
      },
    });

    await this.notifications.notifyRoles(order.tenantId, ['ADMIN', 'ATENDENTE'], {
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
    });

    const fresh = await this.prisma.quote.findUniqueOrThrow({
      where: { id: quote.id },
      include: quoteInclude,
    });
    return toQuoteDto(fresh, order.publicToken);
  }

  /** Recalcula os totais da OS a partir dos itens restantes (menos o desconto). */
  private async applyApprovedQuoteTotals(
    tx: Prisma.TransactionClient,
    orderId: string,
    quote: QuoteRow,
    rejectedGroups: Set<string>,
  ): Promise<void> {
    const groupKey = (it: { id: string; parentItemId: string | null }) => it.parentItemId ?? it.id;
    const approvedItems = quote.items.filter((it) => !rejectedGroups.has(groupKey(it)));
    const services = approvedItems
      .filter((it) => it.kind === 'SERVICE')
      .reduce((sum, it) => sum + dec(it.total), 0);
    const parts = approvedItems
      .filter((it) => it.kind === 'PART')
      .reduce((sum, it) => sum + dec(it.total), 0);
    const discount = dec(quote.discount);
    const total = round2(services + parts - discount);
    await tx.serviceOrder.update({
      where: { id: orderId },
      data: {
        totalServices: round2(services),
        totalParts: round2(parts),
        discount,
        total: total < 0 ? 0 : total,
      },
    });
  }
}
