import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma, QuoteItemDecision, type PrismaClient, type MessageEvent } from '@prisma/client';
import {
  isTerminalStatus,
  type AddItemInput,
  type ChangeStatusInput,
  type CreateServiceOrderTechnicalUpdateInput,
  type CreateServiceOrderInput,
  type DiagnoseServiceOrderInput,
  type ListServiceOrdersQuery,
  type Paginated,
  type ServiceOrderBoardItemDto,
  type ServiceOrderDetailDto,
  type ServiceOrderEventDto,
  type ServiceOrderTechnicalChecklistItem,
  type ServiceOrderItemKind,
  type ServiceOrderStatus,
  type ServiceOrderSummaryDto,
  type ServiceOrderTransitionDto,
  type UpdateItemInput,
  type UpdateServiceOrderInput,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OutboxService } from '../outbox/outbox.service';
import { PurchasesService } from '../purchases/purchases.service';
import { QuotasService } from '../saas/quotas.service';
import { UploadAssetsService } from '../uploads/upload-assets.service';
import { publicTokenExpiresAt } from '../../common/utils/public-token';
import {
  summaryInclude,
  boardInclude,
  eventInclude,
  detailInclude,
} from './service-orders.includes';
import {
  availableTransitionsFor,
  toBoardItemDto,
  toDetailDto,
  toEventDto,
  toSummaryDto,
} from './service-orders.mapper';
import { ServiceOrderStateMachine } from './domain/service-order.state-machine';
import { ServiceOrderDomainError } from './domain/service-order.errors';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

type Tx = Prisma.TransactionClient | PrismaClient;

const dec = (v: Prisma.Decimal | number | null | undefined): number => (v == null ? 0 : Number(v));

const round2 = (n: number): number => Math.round(n * 100) / 100;
const UNIQUE_CONSTRAINT_RETRY_ATTEMPTS = 5;

/** Mapa status → evento de mensagem automática (despachado via outbox). */
const STATUS_MESSAGE_EVENT: Partial<Record<ServiceOrderStatus, MessageEvent>> = {
  DIAGNOSTICO_PRONTO: 'DIAGNOSIS_READY',
  EM_EXECUCAO: 'OS_IN_EXECUTION',
  PRONTA: 'OS_READY',
  PRONTO_RETIRAR: 'CUSTOMER_NOTIFIED',
  ENTREGUE: 'VEHICLE_DELIVERED',
};

@Injectable()
export class ServiceOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly purchases: PurchasesService,
    private readonly outbox: OutboxService,
    private readonly quotas: QuotasService,
    private readonly uploadAssets: UploadAssetsService,
  ) {}

  // ─── Mapping → ./service-orders.mapper.ts ───

  private statusEventTitle(status: ServiceOrderStatus): string {
    const titles: Partial<Record<ServiceOrderStatus, string>> = {
      ENTRADA: 'OS criada',
      DIAGNOSTICO_PRONTO: 'Diagnóstico concluído',
      ORCAMENTO: 'Orçamento gerado',
      ORCAMENTO_APROVADO: 'Orçamento aprovado',
      ORCAMENTO_RECUSADO: 'Orçamento recusado',
      AGUARDANDO_PECA: 'Aguardando peça',
      EM_EXECUCAO: 'Execução iniciada',
      EM_TESTE: 'Enviada para teste',
      PRONTA: 'Serviço finalizado',
      PRONTO_RETIRAR: 'Cliente avisado para retirada',
      ENTREGUE: 'Veículo entregue',
      CANCELADA: 'OS cancelada',
    };
    return titles[status] ?? `Status alterado para ${status}`;
  }

  private async recordOrderEvent(
    tx: Tx,
    input: {
      tenantId: string;
      serviceOrderId: string;
      type: 'STATUS_CHANGE' | 'NOTE' | 'CHECKLIST' | 'PHOTOS' | 'CUSTOMER_NOTIFICATION' | 'SYSTEM';
      title: string;
      description?: string | null;
      visibility?: 'INTERNAL' | 'PUBLIC';
      fromStatus?: ServiceOrderStatus | null;
      toStatus?: ServiceOrderStatus | null;
      checklist?: ServiceOrderTechnicalChecklistItem[];
      photos?: string[];
      createdById?: string | null;
      metadata?: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await tx.serviceOrderEvent.create({
      data: {
        tenantId: input.tenantId,
        serviceOrderId: input.serviceOrderId,
        type: input.type,
        title: input.title,
        description: input.description ?? null,
        visibility: input.visibility ?? 'INTERNAL',
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus ?? null,
        checklist:
          input.checklist && input.checklist.length > 0
            ? (input.checklist as unknown as Prisma.InputJsonValue)
            : undefined,
        photos: input.photos ?? [],
        createdById: input.createdById ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
  }

  // ─── Queries ───
  async list(
    tenantId: string,
    query: ListServiceOrdersQuery,
  ): Promise<Paginated<ServiceOrderSummaryDto>> {
    const { page, pageSize, search, status, technicianId, customerId } = query;
    const where: Prisma.ServiceOrderWhereInput = {
      tenantId,
      ...(status ? { status } : {}),
      ...(technicianId ? { technicianId } : {}),
      ...(customerId ? { customerId } : {}),
      ...(search
        ? {
            OR: [
              ...(/^\d+$/.test(search) ? [{ number: Number(search) }] : []),
              { customer: { name: { contains: search, mode: 'insensitive' } } },
              { vehicle: { plate: { contains: search.toUpperCase() } } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.serviceOrder.count({ where }),
      this.prisma.serviceOrder.findMany({
        where,
        include: summaryInclude,
        orderBy: { number: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      data: rows.map((r) => toSummaryDto(r)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  /**
   * Agrupa OS em andamento por status para o Kanban técnico.
   *
   * O quadro técnico mostra somente OS operacionais. OS canceladas, entregues e
   * recusadas ficam fora do kanban e continuam consultáveis pela listagem de OS.
   */
  async board(tenantId: string): Promise<Record<string, ServiceOrderBoardItemDto[]>> {
    const rows = await this.prisma.serviceOrder.findMany({
      where: {
        tenantId,
        status: { notIn: ['ENTREGUE', 'CANCELADA', 'ORCAMENTO_RECUSADO'] },
      },
      include: boardInclude,
      orderBy: { openedAt: 'asc' },
    });
    const grouped: Record<string, ServiceOrderBoardItemDto[]> = {};
    for (const row of rows) {
      (grouped[row.status] ??= []).push(toBoardItemDto(row));
    }
    return grouped;
  }

  /** Técnicos atribuíveis (perfil TECNICO ativos). Para o seletor da OS. */
  async technicians(tenantId: string): Promise<{ id: string; name: string }[]> {
    return this.prisma.user.findMany({
      where: { tenantId, role: 'TECNICO', active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async transitions(tenantId: string, id: string): Promise<ServiceOrderTransitionDto[]> {
    const row = await this.prisma.serviceOrder.findFirst({
      where: { id, tenantId },
      select: {
        status: true,
        diagnosis: true,
        items: { select: { id: true } },
        quote: { select: { status: true } },
      },
    });
    if (!row) throw new NotFoundException('OS não encontrada');

    return availableTransitionsFor({
      status: row.status,
      diagnosis: row.diagnosis,
      itemCount: row.items.length,
      quoteStatus: row.quote?.status ?? null,
    });
  }

  async reservations(tenantId: string, id: string) {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!order) throw new NotFoundException('OS não encontrada');

    const rows = await this.prisma.stockReservation.findMany({
      where: { tenantId, serviceOrderId: id },
      include: { part: { select: { id: true, name: true, sku: true, unit: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map((r) => ({
      id: r.id,
      partId: r.partId,
      partName: r.part.name,
      partSku: r.part.sku,
      unit: r.part.unit,
      quantity: dec(r.quantity),
      status: r.status,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
      releasedAt: r.releasedAt?.toISOString() ?? null,
      consumedAt: r.consumedAt?.toISOString() ?? null,
      canceledAt: r.canceledAt?.toISOString() ?? null,
    }));
  }

  async findOne(tenantId: string, id: string): Promise<ServiceOrderDetailDto> {
    const row = await this.prisma.serviceOrder.findFirst({
      where: { id, tenantId },
      include: detailInclude,
    });
    if (!row) throw new NotFoundException('OS não encontrada');
    return toDetailDto(row);
  }

  // ─── Commands ───
  /**
   * Gera o próximo número da OS dentro da transação atual.
   *
   * A constraint @@unique([tenantId, number]) continua sendo a proteção final
   * contra concorrência. As operações com numeração sequencial fazem retry em
   * P2002, evitando SQL específico como advisory lock e mantendo compatibilidade
   * com PostgreSQL gerenciado e ambientes de teste.
   */
  private async nextNumber(tx: Tx, tenantId: string): Promise<number> {
    const last = await tx.serviceOrder.findFirst({
      where: { tenantId },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    return (last?.number ?? 0) + 1;
  }

  private isUniqueConstraintError(err: unknown): boolean {
    return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
  }

  /**
   * Reexecuta transações que podem gerar numeração sequencial concorrente
   * (ex.: reposição automática de compras durante a execução da OS).
   */
  private async withUniqueConstraintRetry<T>(
    operation: () => Promise<T>,
    failureMessage = 'Não foi possível concluir a operação concorrente',
  ): Promise<T> {
    for (let attempt = 1; attempt <= UNIQUE_CONSTRAINT_RETRY_ATTEMPTS; attempt++) {
      try {
        return await operation();
      } catch (err) {
        if (this.isUniqueConstraintError(err)) {
          if (attempt < UNIQUE_CONSTRAINT_RETRY_ATTEMPTS) continue;
          throw new ConflictException(failureMessage);
        }
        throw err;
      }
    }

    throw new ConflictException(failureMessage);
  }

  async create(
    actor: AuthenticatedUser,
    input: CreateServiceOrderInput,
  ): Promise<ServiceOrderDetailDto> {
    // Veículo e cliente são compartilhados no grupo (groupId); a OS é por filial.
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: input.vehicleId, tenantId: actor.groupId },
      select: { id: true, customerId: true },
    });
    if (!vehicle) throw new BadRequestException('Veículo inválido');
    if (vehicle.customerId !== input.customerId) {
      throw new BadRequestException('O veículo não pertence ao cliente informado');
    }
    if (input.technicianId) {
      const tech = await this.prisma.user.findFirst({
        where: { id: input.technicianId, tenantId: actor.tenantId },
        select: { id: true },
      });
      if (!tech) throw new BadRequestException('Técnico inválido');
    }

    const created = await this.withUniqueConstraintRetry(
      () =>
        this.prisma.$transaction(async (tx) => {
          await this.quotas.consumeForTenantTx(tx, actor.tenantId, 'SERVICE_ORDERS_MONTH', 1);
          const number = await this.nextNumber(tx, actor.tenantId);
          const order = await tx.serviceOrder.create({
            data: {
              tenantId: actor.tenantId,
              number,
              publicToken: randomBytes(24).toString('hex'),
              publicTokenExpiresAt: publicTokenExpiresAt(),
              customerId: input.customerId,
              vehicleId: input.vehicleId,
              km: input.km ?? null,
              dueDate: input.dueDate ? new Date(input.dueDate) : null,
              technicianId: input.technicianId ?? null,
              reportedProblem: input.reportedProblem,
              status: 'ENTRADA',
              history: {
                create: { status: 'ENTRADA', userId: actor.id, note: 'OS aberta' },
              },
            },
            include: detailInclude,
          });
          await this.recordOrderEvent(tx, {
            tenantId: actor.tenantId,
            serviceOrderId: order.id,
            type: 'STATUS_CHANGE',
            title: this.statusEventTitle('ENTRADA'),
            description: input.reportedProblem,
            visibility: 'PUBLIC',
            toStatus: 'ENTRADA',
            createdById: actor.id,
          });
          // Mensagem de abertura via outbox (atômico com a criação da OS).
          await this.outbox.enqueueOrderEvent(tx, actor.tenantId, 'OS_OPENED', order.id);
          return order;
        }),
      'Não foi possível gerar o número da OS',
    );

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'CREATE',
      module: 'service-orders',
      entity: 'ServiceOrder',
      entityId: created.id,
      after: { number: created.number, status: created.status },
    });

    return toDetailDto(created);
  }

  private async loadEditable(tenantId: string, id: string) {
    const row = await this.prisma.serviceOrder.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true, discount: true },
    });
    if (!row) throw new NotFoundException('OS não encontrada');
    ServiceOrderStateMachine.assertEditable(row.status);
    return row;
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    input: UpdateServiceOrderInput,
  ): Promise<ServiceOrderDetailDto> {
    await this.loadEditable(actor.tenantId, id);

    if (input.technicianId) {
      const tech = await this.prisma.user.findFirst({
        where: { id: input.technicianId, tenantId: actor.tenantId },
        select: { id: true },
      });
      if (!tech) throw new BadRequestException('Técnico inválido');
    }

    await this.prisma.serviceOrder.update({
      where: { id },
      data: {
        ...(input.diagnosis !== undefined ? { diagnosis: input.diagnosis } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.technicianId !== undefined ? { technicianId: input.technicianId || null } : {}),
        ...(input.discount !== undefined ? { discount: round2(input.discount) } : {}),
      },
    });

    if (input.discount !== undefined) {
      await this.recomputeTotals(this.prisma, id);
    }

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'UPDATE',
      module: 'service-orders',
      entity: 'ServiceOrder',
      entityId: id,
    });

    return this.findOne(actor.tenantId, id);
  }

  async diagnose(
    actor: AuthenticatedUser,
    id: string,
    input: DiagnoseServiceOrderInput,
  ): Promise<ServiceOrderDetailDto> {
    await this.loadEditable(actor.tenantId, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.serviceOrder.update({
        where: { id },
        data: {
          diagnosis: input.diagnosis,
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        },
      });
      await this.recordOrderEvent(tx, {
        tenantId: actor.tenantId,
        serviceOrderId: id,
        type: 'NOTE',
        title: 'Diagnóstico atualizado',
        description: input.diagnosis,
        visibility: 'PUBLIC',
        createdById: actor.id,
      });
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'DIAGNOSE',
      module: 'service-orders',
      entity: 'ServiceOrder',
      entityId: id,
    });

    return this.findOne(actor.tenantId, id);
  }

  async changeStatus(
    actor: AuthenticatedUser,
    id: string,
    input: ChangeStatusInput,
  ): Promise<ServiceOrderDetailDto> {
    const row = await this.prisma.serviceOrder.findFirst({
      where: { id, tenantId: actor.tenantId },
      select: {
        id: true,
        number: true,
        status: true,
        diagnosis: true,
        items: { select: { id: true } },
        quote: { select: { status: true } },
      },
    });
    if (!row) throw new NotFoundException('OS não encontrada');

    ServiceOrderStateMachine.assertManualTransition(
      {
        status: row.status,
        diagnosis: row.diagnosis,
        itemCount: row.items.length,
        quoteStatus: row.quote?.status ?? null,
      },
      input.status,
    );

    // Aprovação manual (ORCAMENTO → ORCAMENTO_APROVADO): reserva estoque e
    // decide o orçamento com atualização condicional para bloquear respostas
    // públicas/manuais concorrentes.
    const approving = input.status === 'ORCAMENTO_APROVADO' && row.status === 'ORCAMENTO';
    const refusing = input.status === 'ORCAMENTO_RECUSADO' && row.status === 'ORCAMENTO';
    // Entrar em execução baixa o estoque das peças (uma única vez, vindo de
    // aprovado/aguardando peça — não no retrabalho EM_TESTE → EM_EXECUCAO).
    const executing =
      input.status === 'EM_EXECUCAO' &&
      (row.status === 'ORCAMENTO_APROVADO' || row.status === 'AGUARDANDO_PECA');
    // Cancelar uma OS aprovada/aguardando libera reserva e cancela compras abertas.
    const cancelling =
      input.status === 'CANCELADA' &&
      (row.status === 'ORCAMENTO_APROVADO' || row.status === 'AGUARDANDO_PECA');

    const effectiveStatus = await this.withUniqueConstraintRetry(() =>
      this.prisma.$transaction(async (tx) => {
        let target: ServiceOrderStatus = input.status;
        let approvedQuoteTotals: {
          totalServices: Prisma.Decimal;
          totalParts: Prisma.Decimal;
          discount: Prisma.Decimal;
          total: Prisma.Decimal;
        } | null = null;
        if (approving) {
          const { shortfall } = await this.purchases.commitApprovalReservation(
            tx,
            actor.tenantId,
            id,
          );
          const updatedQuote = await tx.quote.updateMany({
            where: { serviceOrderId: id, status: 'ENVIADO' },
            data: {
              status: 'APROVADO',
              decisionType: 'TOTAL',
              decidedAt: new Date(),
            },
          });
          if (updatedQuote.count !== 1) {
            throw new ConflictException('Orçamento já foi respondido por outra operação');
          }
          await tx.quoteItem.updateMany({
            where: { quote: { serviceOrderId: id } },
            data: { decision: QuoteItemDecision.APROVADO },
          });
          approvedQuoteTotals = await tx.quote.findUnique({
            where: { serviceOrderId: id },
            select: { totalServices: true, totalParts: true, discount: true, total: true },
          });
          await this.outbox.enqueueOrderEvent(tx, actor.tenantId, 'QUOTE_APPROVED', id);
          if (shortfall) target = 'AGUARDANDO_PECA';
        }
        if (refusing) {
          const updatedQuote = await tx.quote.updateMany({
            where: { serviceOrderId: id, status: 'ENVIADO' },
            data: {
              status: 'RECUSADO',
              decisionType: 'RECUSA',
              decidedAt: new Date(),
            },
          });
          if (updatedQuote.count !== 1) {
            throw new ConflictException('Orçamento já foi respondido por outra operação');
          }
          await tx.quoteItem.updateMany({
            where: { quote: { serviceOrderId: id } },
            data: { decision: QuoteItemDecision.RECUSADO },
          });
        }
        if (executing) {
          await this.purchases.consumeOrderParts(tx, actor.tenantId, id, actor.id);
        }
        if (cancelling) {
          await this.purchases.unwindOrderBackorder(tx, id);
        }
        const note =
          input.note ??
          (target === 'AGUARDANDO_PECA'
            ? 'Orçamento aprovado — aguardando peça (gere o pedido de compra)'
            : null);

        const statusUpdate = await tx.serviceOrder.updateMany({
          where: { id, tenantId: actor.tenantId, status: row.status },
          data: {
            status: target,
            ...(approvedQuoteTotals
              ? {
                  totalServices: approvedQuoteTotals.totalServices,
                  totalParts: approvedQuoteTotals.totalParts,
                  discount: approvedQuoteTotals.discount,
                  total: approvedQuoteTotals.total,
                }
              : {}),
            ...(isTerminalStatus(target) ? { publicTokenExpiresAt: new Date() } : {}),
            ...(isTerminalStatus(target) ? { closedAt: new Date() } : {}),
          },
        });
        if (statusUpdate.count !== 1) {
          throw new ConflictException(
            'A OS foi alterada por outra operação. Recarregue e tente novamente.',
          );
        }

        await tx.serviceOrderStatusHistory.create({
          data: {
            serviceOrderId: id,
            status: target,
            userId: actor.id,
            note,
          },
        });
        await this.recordOrderEvent(tx, {
          tenantId: actor.tenantId,
          serviceOrderId: id,
          type: target === 'PRONTO_RETIRAR' ? 'CUSTOMER_NOTIFICATION' : 'STATUS_CHANGE',
          title: this.statusEventTitle(target),
          description: note,
          visibility: ['PRONTA', 'PRONTO_RETIRAR', 'ENTREGUE'].includes(target)
            ? 'PUBLIC'
            : 'INTERNAL',
          fromStatus: row.status,
          toStatus: target,
          createdById: actor.id,
        });
        // Mensagem automática do evento via outbox (atômico com a transição).
        const evt = STATUS_MESSAGE_EVENT[target];
        if (evt) {
          await this.outbox.enqueueOrderEvent(tx, actor.tenantId, evt, id);
        }
        return target;
      }),
    );

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'STATUS_CHANGE',
      module: 'service-orders',
      entity: 'ServiceOrder',
      entityId: id,
      before: { status: row.status },
      after: { status: effectiveStatus },
    });

    await this.notifyStatusChange(actor.tenantId, id, row.number, effectiveStatus);

    return this.findOne(actor.tenantId, id);
  }

  private async notifyStatusChange(
    tenantId: string,
    orderId: string,
    orderNumber: number,
    status: ServiceOrderStatus,
  ): Promise<void> {
    const payloads: Partial<Record<ServiceOrderStatus, { title: string; body: string }>> = {
      DIAGNOSTICO_PRONTO: {
        title: `OS #${orderNumber}: diagnóstico pronto`,
        body: 'Gere ou envie o orçamento para o cliente.',
      },
      ORCAMENTO_APROVADO: {
        title: `OS #${orderNumber}: orçamento aprovado`,
        body: 'A OS está liberada para programação técnica.',
      },
      AGUARDANDO_PECA: {
        title: `OS #${orderNumber}: aguardando peça`,
        body: 'Há falta de peça para seguir com a execução.',
      },
      EM_EXECUCAO: {
        title: `OS #${orderNumber}: execução iniciada`,
        body: 'Acompanhe checklist e fotos do técnico.',
      },
      EM_TESTE: {
        title: `OS #${orderNumber}: em teste`,
        body: 'Valide o serviço antes de finalizar.',
      },
      PRONTA: {
        title: `OS #${orderNumber}: serviço finalizado`,
        body: 'Avise o cliente quando o veículo puder ser retirado.',
      },
      PRONTO_RETIRAR: {
        title: `OS #${orderNumber}: cliente avisado`,
        body: 'Veículo aguardando retirada.',
      },
      ENTREGUE: {
        title: `OS #${orderNumber}: veículo entregue`,
        body: 'OS finalizada com entrega ao cliente.',
      },
    };
    const payload = payloads[status];
    if (!payload) return;
    await this.notifications.notifyRoles(tenantId, ['ADMIN', 'ATENDENTE'], {
      type: 'OS_STATUS',
      title: payload.title,
      body: payload.body,
      link: `/os/${orderId}`,
      entity: 'ServiceOrder',
      entityId: orderId,
    });
  }

  async timeline(tenantId: string, id: string): Promise<ServiceOrderEventDto[]> {
    const row = await this.prisma.serviceOrder.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('OS não encontrada');

    const events = await this.prisma.serviceOrderEvent.findMany({
      where: { tenantId, serviceOrderId: id },
      orderBy: { createdAt: 'desc' },
      include: eventInclude,
    });
    return events.map((event) => toEventDto(event));
  }

  async technicalUpdate(
    actor: AuthenticatedUser,
    id: string,
    input: CreateServiceOrderTechnicalUpdateInput,
  ): Promise<ServiceOrderEventDto[]> {
    const row = await this.prisma.serviceOrder.findFirst({
      where: { id, tenantId: actor.tenantId },
      select: { id: true, number: true, status: true },
    });
    if (!row) throw new NotFoundException('OS não encontrada');
    if (isTerminalStatus(row.status)) {
      throw new BadRequestException('Não é possível atualizar OS terminal');
    }

    await this.uploadAssets.assertOwnedInternalPhotoUrls(actor.tenantId, input.photos);

    const hasChecklist = input.checklist.length > 0;
    const hasPhotos = input.photos.length > 0;
    const type = hasChecklist ? 'CHECKLIST' : hasPhotos ? 'PHOTOS' : 'NOTE';
    const title = hasChecklist
      ? 'Checklist técnico atualizado'
      : hasPhotos
        ? 'Fotos técnicas adicionadas'
        : 'Atualização técnica';

    await this.prisma.$transaction(async (tx) => {
      await this.recordOrderEvent(tx, {
        tenantId: actor.tenantId,
        serviceOrderId: id,
        type,
        title,
        description: input.description ?? null,
        visibility: input.public ? 'PUBLIC' : 'INTERNAL',
        checklist: input.checklist,
        photos: input.photos,
        createdById: actor.id,
      });
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'TECHNICAL_UPDATE',
      module: 'service-orders',
      entity: 'ServiceOrder',
      entityId: id,
      after: { checklist: input.checklist.length, photos: input.photos.length },
    });

    await this.notifications.notifyRoles(actor.tenantId, ['ADMIN', 'ATENDENTE'], {
      type: 'OS_TECHNICAL_UPDATE',
      title: `OS #${row.number}: atualização técnica`,
      body: input.description ?? 'O técnico registrou uma atualização na OS.',
      link: `/os/${id}`,
      entity: 'ServiceOrder',
      entityId: id,
    });

    return this.timeline(actor.tenantId, id);
  }

  // ─── Itens ───
  private async recomputeTotals(tx: Tx, orderId: string): Promise<void> {
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

  async addItem(
    actor: AuthenticatedUser,
    orderId: string,
    input: AddItemInput,
  ): Promise<ServiceOrderDetailDto> {
    await this.loadEditable(actor.tenantId, orderId);
    const lineTotal = round2(input.quantity * input.unitPrice);

    await this.prisma.$transaction(async (tx) => {
      await tx.serviceOrderItem.create({
        data: {
          serviceOrderId: orderId,
          kind: input.kind as ServiceOrderItemKind,
          description: input.description,
          quantity: input.quantity,
          unitPrice: round2(input.unitPrice),
          total: lineTotal,
        },
      });
      await this.recomputeTotals(tx, orderId);
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'ITEM_ADD',
      module: 'service-orders',
      entity: 'ServiceOrder',
      entityId: orderId,
      after: { kind: input.kind, description: input.description },
    });

    return this.findOne(actor.tenantId, orderId);
  }

  async updateItem(
    actor: AuthenticatedUser,
    orderId: string,
    itemId: string,
    input: UpdateItemInput,
  ): Promise<ServiceOrderDetailDto> {
    await this.loadEditable(actor.tenantId, orderId);
    const item = await this.prisma.serviceOrderItem.findFirst({
      where: { id: itemId, serviceOrderId: orderId },
    });
    if (!item) throw new NotFoundException('Item não encontrado');

    // Vínculo peça↔serviço: valida quando informado (string = vincular, null = desvincular).
    if (input.parentItemId !== undefined && input.parentItemId !== null) {
      if (item.kind !== 'PART') {
        throw new BadRequestException('Apenas peças podem ser vinculadas a um serviço');
      }
      const parent = await this.prisma.serviceOrderItem.findFirst({
        where: {
          id: input.parentItemId,
          serviceOrderId: orderId,
          kind: 'SERVICE',
        },
        select: { id: true },
      });
      if (!parent) {
        throw new BadRequestException('Serviço inválido para o vínculo');
      }
    }

    const quantity = input.quantity ?? dec(item.quantity);
    const unitPrice = input.unitPrice ?? dec(item.unitPrice);

    await this.prisma.$transaction(async (tx) => {
      await tx.serviceOrderItem.update({
        where: { id: itemId },
        data: {
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.parentItemId !== undefined ? { parentItemId: input.parentItemId } : {}),
          // Desconto por item (0–100); aplicado ao gerar o orçamento. Não altera o total bruto.
          ...(input.discountPercent !== undefined
            ? { discountPercent: round2(Math.min(100, Math.max(0, input.discountPercent))) }
            : {}),
          quantity,
          unitPrice: round2(unitPrice),
          total: round2(quantity * unitPrice),
        },
      });
      await this.recomputeTotals(tx, orderId);
    });

    return this.findOne(actor.tenantId, orderId);
  }

  async removeItem(
    actor: AuthenticatedUser,
    orderId: string,
    itemId: string,
  ): Promise<ServiceOrderDetailDto> {
    await this.loadEditable(actor.tenantId, orderId);
    const item = await this.prisma.serviceOrderItem.findFirst({
      where: { id: itemId, serviceOrderId: orderId },
      select: { id: true, description: true },
    });
    if (!item) throw new NotFoundException('Item não encontrado');

    // Itens só são editáveis antes da aprovação/execução, quando ainda não houve
    // baixa de estoque — então remover não precisa estornar nada.
    await this.prisma.$transaction(async (tx) => {
      await tx.serviceOrderItem.delete({ where: { id: itemId } });
      await this.recomputeTotals(tx, orderId);
      // Se já existe um orçamento, remove a linha correspondente e recalcula
      // o total do orçamento para refletir a remoção do item.
      await this.recomputeQuoteAfterItemRemoval(tx, orderId, itemId);
    });

    return this.findOne(actor.tenantId, orderId);
  }

  /** Remove o item do orçamento (se houver) e recalcula seus totais. */
  private async recomputeQuoteAfterItemRemoval(
    tx: Prisma.TransactionClient,
    orderId: string,
    serviceOrderItemId: string,
  ): Promise<void> {
    const quote = await tx.quote.findUnique({
      where: { serviceOrderId: orderId },
      select: { id: true, discount: true },
    });
    if (!quote) return;
    await tx.quoteItem.deleteMany({
      where: { quoteId: quote.id, serviceOrderItemId },
    });
    const items = await tx.quoteItem.findMany({
      where: { quoteId: quote.id },
      select: { kind: true, total: true },
    });
    let services = 0;
    let parts = 0;
    for (const it of items) {
      if (it.kind === 'SERVICE') services += dec(it.total);
      else parts += dec(it.total);
    }
    const total = round2(services + parts - dec(quote.discount));
    await tx.quote.update({
      where: { id: quote.id },
      data: {
        totalServices: round2(services),
        totalParts: round2(parts),
        total: total < 0 ? 0 : total,
      },
    });
  }

  // ─── Catálogo → OS ───
  /** Cria um item de peça (snapshot) e baixa o estoque dentro da transação. */
  private async addPartItemTx(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedUser,
    orderId: string,
    part: {
      id: string;
      name: string;
      salePrice: Prisma.Decimal | number;
      costPrice: Prisma.Decimal | number;
    },
    quantity: number,
    parentItemId?: string,
  ): Promise<void> {
    const unitPrice = round2(dec(part.salePrice));
    // Peça entra na OS apenas como planejamento — sem baixar estoque. A baixa
    // ocorre quando a OS vai para execução (após aprovação e chegada das peças).
    await tx.serviceOrderItem.create({
      data: {
        serviceOrderId: orderId,
        kind: 'PART',
        description: part.name,
        quantity,
        unitPrice,
        total: round2(unitPrice * quantity),
        sourcePartId: part.id,
        parentItemId: parentItemId ?? null,
      },
    });
  }

  /** Adiciona um serviço do catálogo + suas peças padrão (com baixa de estoque). */
  async addServiceFromCatalog(
    actor: AuthenticatedUser,
    orderId: string,
    serviceId: string,
  ): Promise<ServiceOrderDetailDto> {
    await this.loadEditable(actor.tenantId, orderId);
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, tenantId: actor.groupId },
      include: {
        defaultParts: {
          include: {
            part: {
              select: { id: true, name: true, salePrice: true, costPrice: true },
            },
          },
        },
      },
    });
    if (!service) throw new BadRequestException('Serviço inválido');

    await this.prisma.$transaction(async (tx) => {
      const price = round2(dec(service.salePrice));
      const serviceItem = await tx.serviceOrderItem.create({
        data: {
          serviceOrderId: orderId,
          kind: 'SERVICE',
          description: service.name,
          quantity: 1,
          unitPrice: price,
          total: price,
          sourceServiceId: service.id,
        },
      });
      for (const dp of service.defaultParts) {
        await this.addPartItemTx(tx, actor, orderId, dp.part, dec(dp.quantity), serviceItem.id);
      }
      await this.recomputeTotals(tx, orderId);
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'ITEM_ADD',
      module: 'service-orders',
      entity: 'ServiceOrder',
      entityId: orderId,
      after: { fromCatalog: 'service', name: service.name },
    });

    return this.findOne(actor.tenantId, orderId);
  }

  /** Adiciona uma peça do catálogo (com baixa de estoque). */
  async addPartFromCatalog(
    actor: AuthenticatedUser,
    orderId: string,
    partId: string,
    quantity: number,
  ): Promise<ServiceOrderDetailDto> {
    await this.loadEditable(actor.tenantId, orderId);
    const part = await this.prisma.part.findFirst({
      where: { id: partId, tenantId: actor.groupId },
      select: { id: true, name: true, salePrice: true, costPrice: true },
    });
    if (!part) throw new BadRequestException('Peça inválida');

    await this.prisma.$transaction(async (tx) => {
      await this.addPartItemTx(tx, actor, orderId, part, quantity);
      await this.recomputeTotals(tx, orderId);
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'ITEM_ADD',
      module: 'service-orders',
      entity: 'ServiceOrder',
      entityId: orderId,
      after: { fromCatalog: 'part', name: part.name },
    });

    return this.findOne(actor.tenantId, orderId);
  }

  /**
   * Adiciona um combo: expande nos serviços que o compõem (+ peças padrão deles).
   * O combo NÃO aparece como tal na OS — somente os serviços e peças.
   */
  async addComboToOrder(
    actor: AuthenticatedUser,
    orderId: string,
    comboId: string,
  ): Promise<ServiceOrderDetailDto> {
    await this.loadEditable(actor.tenantId, orderId);
    const combo = await this.prisma.combo.findFirst({
      where: { id: comboId, tenantId: actor.groupId },
      include: {
        services: {
          orderBy: { position: 'asc' },
          include: {
            service: {
              include: {
                defaultParts: {
                  include: {
                    part: {
                      select: {
                        id: true,
                        name: true,
                        salePrice: true,
                        costPrice: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!combo) throw new BadRequestException('Combo inválido');

    await this.prisma.$transaction(async (tx) => {
      for (const cs of combo.services) {
        const svc = cs.service;
        const price = round2(dec(svc.salePrice));
        const serviceItem = await tx.serviceOrderItem.create({
          data: {
            serviceOrderId: orderId,
            kind: 'SERVICE',
            description: svc.name,
            quantity: 1,
            unitPrice: price,
            total: price,
            sourceServiceId: svc.id,
          },
        });
        for (const dp of svc.defaultParts) {
          await this.addPartItemTx(tx, actor, orderId, dp.part, dec(dp.quantity), serviceItem.id);
        }
      }
      await this.recomputeTotals(tx, orderId);
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'ITEM_ADD',
      module: 'service-orders',
      entity: 'ServiceOrder',
      entityId: orderId,
      after: { fromCatalog: 'combo', name: combo.name },
    });

    return this.findOne(actor.tenantId, orderId);
  }
}

export { ServiceOrderDomainError };
