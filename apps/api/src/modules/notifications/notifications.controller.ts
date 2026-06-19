import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  listNotificationsQuerySchema,
  pushSubscribeSchema,
  type ListNotificationsQuery,
  type PushSubscribeInput,
} from '@oficina/shared';
import { z } from 'zod';
import { NotificationsService } from './notifications.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AllowAuthenticated } from '../../common/decorators/allow-authenticated.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const unsubscribeSchema = z.object({ endpoint: z.string().min(1) });

@AllowAuthenticated()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('inbox')
  inbox(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.inbox(user.id);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listNotificationsQuerySchema))
    query: ListNotificationsQuery,
  ) {
    return this.notifications.list(user.id, query);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return { count: await this.notifications.unreadCount(user.id) };
  }

  @Get('push/public-key')
  publicKey() {
    return { key: this.notifications.publicKey() };
  }

  @Post(':id/read')
  @HttpCode(204)
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @Post('read-all')
  @HttpCode(204)
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Post('push/subscribe')
  @HttpCode(204)
  subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(pushSubscribeSchema)) body: PushSubscribeInput,
  ) {
    return this.notifications.subscribePush(user.id, body);
  }

  @Post('push/unsubscribe')
  @HttpCode(204)
  unsubscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(unsubscribeSchema)) body: { endpoint: string },
  ) {
    return this.notifications.unsubscribePush(user.id, body.endpoint);
  }
}
