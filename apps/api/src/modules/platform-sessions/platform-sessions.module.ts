import { Module } from '@nestjs/common';
import { PlatformSessionsController } from './platform-sessions.controller';
import { PlatformSessionsService } from './platform-sessions.service';

@Module({
  controllers: [PlatformSessionsController],
  providers: [PlatformSessionsService],
})
export class PlatformSessionsModule {}
