import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiProviderService } from './ai-provider.service';
import { AiController, AiAssistController } from './ai.controller';

@Module({
  controllers: [AiController, AiAssistController],
  providers: [AiService, AiProviderService],
})
export class AiModule {}
