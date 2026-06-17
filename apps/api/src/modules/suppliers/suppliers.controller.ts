import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import {
  createSupplierSchema,
  listSuppliersQuerySchema,
  updateSupplierSchema,
  Permission,
  type CreateSupplierInput,
  type ListSuppliersQuery,
  type UpdateSupplierInput,
} from '@oficina/shared';
import { SuppliersService } from './suppliers.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  @RequirePermission(Permission.PURCHASES_READ)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(listSuppliersQuerySchema))
    query: ListSuppliersQuery,
  ) {
    return this.suppliers.list(actor.groupId, query);
  }

  @Post()
  @RequirePermission(Permission.PURCHASES_WRITE)
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(createSupplierSchema)) body: CreateSupplierInput,
  ) {
    return this.suppliers.create(actor, body);
  }

  @Put(':id')
  @RequirePermission(Permission.PURCHASES_WRITE)
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSupplierSchema)) body: UpdateSupplierInput,
  ) {
    return this.suppliers.update(actor, id, body);
  }
}
