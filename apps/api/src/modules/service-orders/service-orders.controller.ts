import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseFilters,
} from '@nestjs/common';
import {
  addItemSchema,
  addServiceFromCatalogSchema,
  addPartFromCatalogSchema,
  addComboToOrderSchema,
  changeStatusSchema,
  createServiceOrderTechnicalUpdateSchema,
  createServiceOrderSchema,
  diagnoseServiceOrderSchema,
  listServiceOrdersQuerySchema,
  updateItemSchema,
  updateServiceOrderSchema,
  Permission,
  type AddItemInput,
  type AddServiceFromCatalogInput,
  type AddPartFromCatalogInput,
  type AddComboToOrderInput,
  type ChangeStatusInput,
  type CreateServiceOrderTechnicalUpdateInput,
  type CreateServiceOrderInput,
  type DiagnoseServiceOrderInput,
  type ListServiceOrdersQuery,
  type UpdateItemInput,
  type UpdateServiceOrderInput,
} from '@oficina/shared';
import { ServiceOrdersService } from './service-orders.service';
import { ServiceOrderExceptionFilter } from './service-order-exception.filter';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Controller('service-orders')
@UseFilters(ServiceOrderExceptionFilter)
export class ServiceOrdersController {
  constructor(private readonly orders: ServiceOrdersService) {}

  @Get()
  @RequirePermission(Permission.OS_READ)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(listServiceOrdersQuerySchema))
    query: ListServiceOrdersQuery,
  ) {
    return this.orders.list(actor.tenantId, query);
  }

  @Get('board')
  @RequirePermission(Permission.OS_READ)
  board(@CurrentUser() actor: AuthenticatedUser) {
    return this.orders.board(actor.tenantId);
  }

  @Get('technicians')
  @RequirePermission(Permission.OS_READ)
  technicians(@CurrentUser() actor: AuthenticatedUser) {
    return this.orders.technicians(actor.tenantId);
  }

  @Get(':id/transitions')
  @RequirePermission(Permission.OS_READ)
  transitions(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.orders.transitions(actor.tenantId, id);
  }

  @Get(':id/timeline')
  @RequirePermission(Permission.OS_READ)
  timeline(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.orders.timeline(actor.tenantId, id);
  }

  @Get(':id/reservations')
  @RequirePermission(Permission.OS_READ)
  reservations(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.orders.reservations(actor.tenantId, id);
  }

  @Post(':id/technical-update')
  @RequirePermission(Permission.OS_DIAGNOSE)
  technicalUpdate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createServiceOrderTechnicalUpdateSchema))
    body: CreateServiceOrderTechnicalUpdateInput,
  ) {
    return this.orders.technicalUpdate(actor, id, body);
  }

  @Get(':id')
  @RequirePermission(Permission.OS_READ)
  findOne(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.orders.findOne(actor.tenantId, id);
  }

  @Post()
  @RequirePermission(Permission.OS_WRITE)
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(createServiceOrderSchema))
    body: CreateServiceOrderInput,
  ) {
    return this.orders.create(actor, body);
  }

  @Patch(':id')
  @RequirePermission(Permission.OS_WRITE)
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateServiceOrderSchema))
    body: UpdateServiceOrderInput,
  ) {
    return this.orders.update(actor, id, body);
  }

  @Patch(':id/diagnosis')
  @RequirePermission(Permission.OS_DIAGNOSE)
  diagnose(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(diagnoseServiceOrderSchema))
    body: DiagnoseServiceOrderInput,
  ) {
    return this.orders.diagnose(actor, id, body);
  }

  @Post(':id/status')
  @RequirePermission(Permission.OS_STATUS)
  changeStatus(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(changeStatusSchema)) body: ChangeStatusInput,
  ) {
    return this.orders.changeStatus(actor, id, body);
  }

  @Post(':id/items')
  @RequirePermission(Permission.OS_WRITE)
  addItem(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addItemSchema)) body: AddItemInput,
  ) {
    return this.orders.addItem(actor, id, body);
  }

  @Post(':id/add-service')
  @RequirePermission(Permission.OS_WRITE)
  addService(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addServiceFromCatalogSchema))
    body: AddServiceFromCatalogInput,
  ) {
    return this.orders.addServiceFromCatalog(actor, id, body.serviceId);
  }

  @Post(':id/add-part')
  @RequirePermission(Permission.OS_WRITE)
  addPart(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addPartFromCatalogSchema))
    body: AddPartFromCatalogInput,
  ) {
    return this.orders.addPartFromCatalog(actor, id, body.partId, body.quantity);
  }

  @Post(':id/add-combo')
  @RequirePermission(Permission.OS_WRITE)
  addCombo(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addComboToOrderSchema))
    body: AddComboToOrderInput,
  ) {
    return this.orders.addComboToOrder(actor, id, body.comboId);
  }

  @Patch(':id/items/:itemId')
  @RequirePermission(Permission.OS_WRITE)
  updateItem(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body(new ZodValidationPipe(updateItemSchema)) body: UpdateItemInput,
  ) {
    return this.orders.updateItem(actor, id, itemId, body);
  }

  @Delete(':id/items/:itemId')
  @RequirePermission(Permission.OS_WRITE)
  removeItem(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.orders.removeItem(actor, id, itemId);
  }
}
