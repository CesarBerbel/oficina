import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, type MessageEvent, type PrismaClient } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DispatchOutboxMessageUseCase } from './use-cases/dispatch-outbox-message.usecase';

type Tx = Prisma.TransactionClient | PrismaClient;

const STUCK_MS = 5 * 60 * 1000; // PROCESSING preso há +5min volta para PENDING
const MAX_BACKOFF_MS = 60 * 60 * 1000; // teto de 1h entre tentativas

type OrderEventPayload = { event: MessageEvent; orderId: string };

/**
 * Outbox transacional: produtores gravam o evento na MESMA transação do domínio
 * (atômico), e este serviço despacha de forma assíncrona com reentrega
 * (ao-menos-uma-vez), backoff exponencial e recuperação de itens presos.
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatchOutboxMessage: DispatchOutboxMessageUseCase,
  ) {}

  private orderEventIdempotencyKey(
    tenantId: string,
    event: MessageEvent,
    orderId: string,
    scope: string,
  ): string {
    return `ORDER_EVENT:${tenantId}:${event}:${orderId}:${scope}`;
  }

  /** Enfileira um evento de OS dentro da transação do produtor. */
  async enqueueOrderEvent(
    tx: Tx,
    tenantId: string,
    event: MessageEvent,
    orderId: string,
    idempotencyScope = 'default',
  ): Promise<void> {
    const idempotencyKey = this.orderEventIdempotencyKey(
      tenantId,
      event,
      orderId,
      idempotencyScope,
    );
    await tx.outboxMessage.upsert({
      where: { idempotencyKey },
      create: {
        tenantId,
        type: 'ORDER_EVENT',
        idempotencyKey,
        payload: { event, orderId } satisfies OrderEventPayload,
      },
      // Mantém a mensagem original. Se ela já foi criada por outra transação,
      // não reabre DONE/FAILED nem duplica o dispatch.
      update: { payload: { event, orderId } satisfies OrderEventPayload },
    });
  }

  @Cron('*/1 * * * *')
  async scheduledProcess(): Promise<void> {
    // Em testes o processamento é manual (evita interferência nos e2e).
    if (process.env.NODE_ENV === 'test') return;
    if (this.running) return; // evita sobreposição de execuções
    this.running = true;
    try {
      await this.processPending();
    } catch (err) {
      this.logger.error(
        `Falha ao processar outbox: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.running = false;
    }
  }

  /** Processa um lote de mensagens pendentes. Retorna o resumo do lote. */
  async processPending(limit = 25): Promise<{ done: number; failed: number; retried: number }> {
    // Recupera itens presos em PROCESSING (worker que caiu no meio).
    await this.prisma.outboxMessage.updateMany({
      where: { status: 'PROCESSING', updatedAt: { lt: new Date(Date.now() - STUCK_MS) } },
      data: { status: 'PENDING' },
    });

    const batch = await this.prisma.outboxMessage.findMany({
      where: { status: 'PENDING', availableAt: { lte: new Date() } },
      orderBy: { availableAt: 'asc' },
      take: limit,
    });

    let done = 0;
    let failed = 0;
    let retried = 0;

    for (const msg of batch) {
      // Reivindica o item de forma atômica (evita processamento duplicado).
      const claim = await this.prisma.outboxMessage.updateMany({
        where: { id: msg.id, status: 'PENDING' },
        data: { status: 'PROCESSING' },
      });
      if (claim.count !== 1) continue;

      try {
        await this.handle(msg.id, msg.type, msg.tenantId, msg.payload);
        await this.prisma.outboxMessage.update({
          where: { id: msg.id },
          data: { status: 'DONE', processedAt: new Date(), lastError: null },
        });
        done += 1;
      } catch (err) {
        const attempts = msg.attempts + 1;
        const message = err instanceof Error ? err.message : String(err);
        if (attempts >= msg.maxAttempts) {
          await this.prisma.outboxMessage.update({
            where: { id: msg.id },
            data: { status: 'FAILED', attempts, lastError: message },
          });
          failed += 1;
          this.logger.error(
            `Outbox ${msg.id} (${msg.type}) falhou definitivamente após ${attempts} tentativas: ${message}`,
          );
        } else {
          const backoff = Math.min(2 ** attempts * 1000, MAX_BACKOFF_MS);
          await this.prisma.outboxMessage.update({
            where: { id: msg.id },
            data: {
              status: 'PENDING',
              attempts,
              lastError: message,
              availableAt: new Date(Date.now() + backoff),
            },
          });
          retried += 1;
        }
      }
    }

    return { done, failed, retried };
  }

  private async handle(
    messageId: string,
    type: string,
    tenantId: string,
    payload: Prisma.JsonValue,
  ): Promise<void> {
    await this.dispatchOutboxMessage.execute({ messageId, type, tenantId, payload });
  }
}
