import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  createPartSchema,
  listPartsQuerySchema,
  stockMovementSchema,
  updatePartSchema,
  Permission,
  type CreatePartInput,
  type ListPartsQuery,
  type StockMovementInput,
  type UpdatePartInput,
} from '@oficina/shared';
import { InventoryService } from './inventory.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Controller('parts')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @RequirePermission(Permission.INVENTORY_READ)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(listPartsQuerySchema)) query: ListPartsQuery,
  ) {
    return this.inventory.list(actor.tenantId, query);
  }

  @Get(':id')
  @RequirePermission(Permission.INVENTORY_READ)
  findOne(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.inventory.findOne(actor.tenantId, id);
  }

  @Get(':id/movements')
  @RequirePermission(Permission.INVENTORY_READ)
  movements(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.inventory.movements(actor.tenantId, id);
  }

  @Post()
  @RequirePermission(Permission.INVENTORY_WRITE)
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(createPartSchema)) body: CreatePartInput,
  ) {
    return this.inventory.create(actor, body);
  }

  @Put(':id')
  @RequirePermission(Permission.INVENTORY_WRITE)
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePartSchema)) body: UpdatePartInput,
  ) {
    return this.inventory.update(actor, id, body);
  }

  @Post(':id/movements')
  @RequirePermission(Permission.STOCK_MOVE)
  move(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(stockMovementSchema)) body: StockMovementInput,
  ) {
    return this.inventory.move(actor, id, body);
  }
}
