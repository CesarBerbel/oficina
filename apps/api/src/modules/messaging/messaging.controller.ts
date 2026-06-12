import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  createTemplateSchema,
  listMessagesQuerySchema,
  sendMessageSchema,
  sendTestEmailSchema,
  updateTemplateSchema,
  Permission,
  type CreateTemplateInput,
  type ListMessagesQuery,
  type SendMessageInput,
  type SendTestEmailInput,
  type UpdateTemplateInput,
} from '@oficina/shared';
import { MessagingService } from './messaging.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Controller('messages')
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get('templates')
  @RequirePermission(Permission.MESSAGES_READ)
  templates(@CurrentUser() actor: AuthenticatedUser) {
    return this.messaging.listTemplates(actor.tenantId);
  }

  @Post('templates')
  @RequirePermission(Permission.MESSAGES_WRITE)
  createTemplate(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(createTemplateSchema)) body: CreateTemplateInput,
  ) {
    return this.messaging.createTemplate(actor, body);
  }

  @Put('templates/:id')
  @RequirePermission(Permission.MESSAGES_WRITE)
  updateTemplate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTemplateSchema)) body: UpdateTemplateInput,
  ) {
    return this.messaging.updateTemplate(actor, id, body);
  }

  @Delete('templates/:id')
  @RequirePermission(Permission.MESSAGES_WRITE)
  removeTemplate(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.messaging.removeTemplate(actor, id);
  }

  @Get('mail-status')
  @RequirePermission(Permission.MESSAGES_READ)
  mailStatus() {
    return this.messaging.mailStatus();
  }

  @Get('logs')
  @RequirePermission(Permission.MESSAGES_READ)
  logs(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(listMessagesQuerySchema)) query: ListMessagesQuery,
  ) {
    return this.messaging.listLogs(actor.tenantId, query);
  }

  @Post('send')
  @RequirePermission(Permission.MESSAGES_WRITE)
  send(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessageInput,
  ) {
    return this.messaging.sendManual(actor, body);
  }

  @Post('test-email')
  @RequirePermission(Permission.MESSAGES_WRITE)
  testEmail(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(sendTestEmailSchema)) body: SendTestEmailInput,
  ) {
    return this.messaging.sendTestEmail(actor, body.to);
  }
}
