import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  aiArticleSchema,
  aiAssistSchema,
  updateAiConfigSchema,
  Permission,
  type AiArticleInput,
  type AiAssistInput,
  type UpdateAiConfigInput,
} from '@oficina/shared';
import { AiService } from './ai.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Controller('ai-config')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get()
  @RequirePermission(Permission.AI_READ)
  get(@CurrentUser() actor: AuthenticatedUser) {
    return this.ai.get(actor.tenantId);
  }

  @Get('usage')
  @RequirePermission(Permission.AI_READ)
  usage(@CurrentUser() actor: AuthenticatedUser) {
    return this.ai.usage(actor.tenantId);
  }

  @Put()
  @RequirePermission(Permission.AI_MANAGE)
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateAiConfigSchema)) body: UpdateAiConfigInput,
  ) {
    return this.ai.update(actor, body);
  }
}

/** Geração de texto pela IA (assistente). Requer a permissão AI_USE. */
@Controller('ai')
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class AiAssistController {
  constructor(private readonly ai: AiService) {}

  @Post('assist')
  @RequirePermission(Permission.AI_USE)
  assist(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(aiAssistSchema)) body: AiAssistInput,
  ) {
    return this.ai.assist(actor, body);
  }

  @Post('article')
  @RequirePermission(Permission.AI_USE)
  article(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(aiArticleSchema)) body: AiArticleInput,
  ) {
    return this.ai.article(actor, body);
  }
}
