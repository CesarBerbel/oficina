import { Global, Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { DispatchOutboxMessageUseCase } from './use-cases/dispatch-outbox-message.usecase';

@Global()
@Module({
  providers: [OutboxService, DispatchOutboxMessageUseCase],
  exports: [OutboxService],
})
export class OutboxModule {}
