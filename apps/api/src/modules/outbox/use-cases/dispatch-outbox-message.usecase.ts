import { Injectable } from '@nestjs/common';
import { Prisma, type MessageEvent } from '@prisma/client';
import { MessagingService } from '../../messaging/messaging.service';

type OrderEventPayload = { event: MessageEvent; orderId: string };

/**
 * Caso de uso de dispatch de uma mensagem do outbox.
 * Mantém o worker focado em claim/retry/backoff e isola os handlers por tipo.
 */
@Injectable()
export class DispatchOutboxMessageUseCase {
  constructor(private readonly messaging: MessagingService) {}

  async execute(input: {
    messageId: string;
    type: string;
    tenantId: string;
    payload: Prisma.JsonValue;
  }): Promise<void> {
    if (input.type === 'ORDER_EVENT') {
      const { event, orderId } = input.payload as OrderEventPayload;
      await this.messaging.dispatchOrderEvent(
        input.tenantId,
        event,
        orderId,
        `outbox:${input.messageId}`,
      );
      return;
    }

    throw new Error(`Tipo de outbox desconhecido: ${input.type}`);
  }
}
