import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  Permission,
  type CreateUserInput,
  type ListUsersQuery,
  type UpdateUserInput,
} from '@oficina/shared';
import { z } from 'zod';
import { UsersService } from './users.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const setActiveSchema = z.object({ active: z.boolean() });

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermission(Permission.USERS_READ)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQuery,
  ) {
    return this.users.list(actor.tenantId, query);
  }

  @Get(':id')
  @RequirePermission(Permission.USERS_READ)
  findOne(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.users.findOne(actor.tenantId, id);
  }

  @Post()
  @RequirePermission(Permission.USERS_WRITE)
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput,
  ) {
    return this.users.create(actor, body);
  }

  @Put(':id')
  @RequirePermission(Permission.USERS_WRITE)
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserInput,
  ) {
    return this.users.update(actor, id, body);
  }

  @Patch(':id/active')
  @RequirePermission(Permission.USERS_WRITE)
  setActive(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setActiveSchema)) body: { active: boolean },
  ) {
    return this.users.setActive(actor, id, body.active);
  }
}
