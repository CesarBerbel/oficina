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
import { PurchasesService } from '../purchases/purchases.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const dec = (v: Prisma.Decimal | number | null | undefined): number =>
  v == null ? 0 : Number(v);
const round2 = (n: number): number => Math.round(n * 100) / 100;
const brl = (n: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

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
    private readonly purchases: PurchasesService,
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
    if (order.status === 'ENTRADA') {
      throw new ServiceOrderDomainError(
        'Conclua o diagnóstico antes de gerar o orçamento.',
      );
    }
    // Orçamento só pode ser gerado/regerado a partir do diagnóstico pronto,
    // enquanto está em orçamento, ou após uma recusa (novo orçamento).
    const ALLOWED_GENERATE_STATUSES = [
      'DIAGNOSTICO_PRONTO',
      'ORCAMENTO',
      'ORCAMENTO_RECUSADO',
    ];
    if (!ALLOWED_GENERATE_STATUSES.includes(order.status)) {
      throw new ServiceOrderDomainError(
        'Não é possível gerar orçamento neste estágio da OS.',
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
      await tx.serviceOrder.update({
        where: { id: orderId },
        data: {
          status: historyStatus,
          history: {
            create: {
              status: historyStatus,
              userId: actor.id,
              note: `${movingToQuote ? 'Orçamento enviado' : 'Orçamento reenviado'} · ${brl(dec(order.total))}`,
            },
          },
        },
      });

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

  /**
   * Reabre o orçamento de uma OS aprovada: volta para "diagnóstico pronto",
   * destravando a edição de itens (serviços, combos, peças) e permitindo gerar
   * um novo orçamento. Registra a reabertura no histórico da OS.
   */
  async reopen(
    actor: AuthenticatedUser,
    orderId: string,
  ): Promise<QuoteDto | null> {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id: orderId, tenantId: actor.tenantId },
      select: { id: true, status: true },
    });
    if (!order) throw new NotFoundException('OS não encontrada');
    if (
      order.status !== 'ORCAMENTO_APROVADO' &&
      order.status !== 'AGUARDANDO_PECA'
    ) {
      throw new ServiceOrderDomainError(
        'Só é possível reabrir o orçamento de uma OS aprovada ou aguardando peça.',
      );
    }
    if (!canTransition(order.status, 'DIAGNOSTICO_PRONTO')) {
      throw new ServiceOrderDomainError(
        'Não é possível reabrir o orçamento neste estágio da OS.',
      );
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

  /** Envia o link do orçamento para o e-mail do cliente. */
  async sendEmail(
    actor: AuthenticatedUser,
    orderId: string,
  ): Promise<{ to: string }> {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id: orderId, tenantId: actor.tenantId },
      select: { id: true, quote: { select: { id: true } } },
    });
    if (!order) throw new NotFoundException('OS não encontrada');
    if (!order.quote) {
      throw new BadRequestException('Gere o orçamento antes de enviar por e-mail');
    }

    const res = await this.messaging.sendQuoteEmail(actor.tenantId, orderId);

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

    // Itens da OS correspondentes aos itens recusados — serão removidos da OS
    // (e dos totais) quando houver aprovação parcial.
    const rejectedOrderItemIds = quote.items
      .filter(
        (it) => rejectedGroups.has(groupKey(it)) && it.serviceOrderItemId,
      )
      .map((it) => it.serviceOrderItemId as string);

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
          signatureName: input.signatureName,
          signatureDoc: input.signatureDoc,
        },
      });

      if (approved === 0) {
        // Recusa total: a OS vai para "recusado", de onde é possível gerar
        // um novo orçamento.
        if (canTransition(order.status, 'ORCAMENTO_RECUSADO')) {
          await tx.serviceOrder.update({
            where: { id: order.id },
            data: {
              status: 'ORCAMENTO_RECUSADO',
              history: {
                create: {
                  status: 'ORCAMENTO_RECUSADO',
                  note: 'Orçamento recusado pelo cliente',
                },
              },
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
          await this.recomputeOrderTotals(tx, order.id);
        }

        // Reserva o estoque e gera o pedido de compra do que falta (peças
        // aprovadas). Com falta → "aguardando peça"; tudo coberto → "aprovado".
        const { shortfall } = await this.purchases.commitApprovalReservation(
          tx,
          order.tenantId,
          order.id,
        );
        const target = shortfall ? 'AGUARDANDO_PECA' : 'ORCAMENTO_APROVADO';
        if (canTransition(order.status, target)) {
          const note = shortfall
            ? 'Orçamento aprovado — aguardando peça (pedido de compra gerado)'
            : decisionType === 'TOTAL'
              ? 'Orçamento aprovado pelo cliente'
              : 'Orçamento aprovado parcialmente pelo cliente';
          await tx.serviceOrder.update({
            where: { id: order.id },
            data: {
              status: target,
              history: { create: { status: target, note } },
            },
          });
        }
      }
    });

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

  /** Recalcula os totais da OS a partir dos itens restantes (menos o desconto). */
  private async recomputeOrderTotals(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<void> {
    const items = await tx.serviceOrderItem.findMany({
      where: { serviceOrderId: orderId },
      select: { kind: true, total: true },
    });
    let services = 0;
    let parts = 0;
    for (const it of items) {
      if (it.kind === 'SERVICE') services += dec(it.total);
      else parts += dec(it.total);
    }
    const order = await tx.serviceOrder.findUniqueOrThrow({
      where: { id: orderId },
      select: { discount: true },
    });
    const total = round2(services + parts - dec(order.discount));
    await tx.serviceOrder.update({
      where: { id: orderId },
      data: {
        totalServices: round2(services),
        totalParts: round2(parts),
        total: total < 0 ? 0 : total,
      },
    });
  }
}
