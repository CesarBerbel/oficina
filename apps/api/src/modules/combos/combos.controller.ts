import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  createComboSchema,
  listCombosQuerySchema,
  updateComboSchema,
  Permission,
  type CreateComboInput,
  type ListCombosQuery,
  type UpdateComboInput,
} from '@oficina/shared';
import { CombosService } from './combos.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Controller('combos')
export class CombosController {
  constructor(private readonly combos: CombosService) {}

  @Get()
  @RequirePermission(Permission.SERVICES_READ)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(listCombosQuerySchema)) query: ListCombosQuery,
  ) {
    return this.combos.list(actor.groupId, query);
  }

  @Get(':id')
  @RequirePermission(Permission.SERVICES_READ)
  findOne(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.combos.findOne(actor.groupId, id);
  }

  @Post()
  @RequirePermission(Permission.COMBOS_WRITE)
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(createComboSchema)) body: CreateComboInput,
  ) {
    return this.combos.create(actor, body);
  }

  @Put(':id')
  @RequirePermission(Permission.COMBOS_WRITE)
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateComboSchema)) body: UpdateComboInput,
  ) {
    return this.combos.update(actor, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission(Permission.COMBOS_WRITE)
  remove(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.combos.remove(actor, id);
  }
}
