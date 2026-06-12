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
  createCategorySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
  Permission,
  type CreateCategoryInput,
  type ListCategoriesQuery,
  type UpdateCategoryInput,
} from '@oficina/shared';
import { CategoriesService } from './categories.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  // Listagem liberada a qualquer usuário autenticado (alimenta os selects dos
  // cadastros de cliente, serviço e peça).
  @Get()
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(listCategoriesQuerySchema))
    query: ListCategoriesQuery,
  ) {
    return this.categories.list(actor.tenantId, query.kind);
  }

  @Post()
  @RequirePermission(Permission.SETTINGS_MANAGE)
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(createCategorySchema)) body: CreateCategoryInput,
  ) {
    return this.categories.create(actor, body);
  }

  @Put(':id')
  @RequirePermission(Permission.SETTINGS_MANAGE)
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) body: UpdateCategoryInput,
  ) {
    return this.categories.update(actor, id, body);
  }

  @Delete(':id')
  @RequirePermission(Permission.SETTINGS_MANAGE)
  remove(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.categories.remove(actor, id);
  }
}
