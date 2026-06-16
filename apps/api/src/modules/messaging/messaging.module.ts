import { Global, Module } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { MessagingController } from './messaging.controller';
import { BirthdayCronService } from './birthday-cron.service';

@Global()
@Module({
  controllers: [MessagingController],
  providers: [MessagingService, BirthdayCronService],
  exports: [MessagingService],
})
export class MessagingModule {}
