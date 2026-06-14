import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  convertLeadToServiceOrderSchema,
  linkLeadCustomerSchema,
  linkLeadVehicleSchema,
  listLeadsQuerySchema,
  registerLeadContactSchema,
  updateLeadStatusSchema,
  Permission,
  type ConvertLeadToServiceOrderInput,
  type LinkLeadCustomerInput,
  type LinkLeadVehicleInput,
  type ListLeadsQuery,
  type RegisterLeadContactInput,
  type UpdateLeadStatusInput,
} from '@oficina/shared';
import { LeadsService } from './leads.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @RequirePermission(Permission.CUSTOMERS_READ)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(listLeadsQuerySchema)) query: ListLeadsQuery,
  ) {
    return this.leads.list(actor.tenantId, query);
  }

  @Get(':id')
  @RequirePermission(Permission.CUSTOMERS_READ)
  findOne(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.leads.findOne(actor.tenantId, id);
  }

  @Post(':id/status')
  @RequirePermission(Permission.CUSTOMERS_WRITE)
  updateStatus(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateLeadStatusSchema)) body: UpdateLeadStatusInput,
  ) {
    return this.leads.updateStatus(actor, id, body.status);
  }

  @Post(':id/contact-attempts')
  @RequirePermission(Permission.CUSTOMERS_WRITE)
  registerContact(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(registerLeadContactSchema))
    body: RegisterLeadContactInput,
  ) {
    return this.leads.registerContact(actor, id, body);
  }

  @Post(':id/link-customer')
  @RequirePermission(Permission.CUSTOMERS_WRITE)
  linkCustomer(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(linkLeadCustomerSchema)) body: LinkLeadCustomerInput,
  ) {
    return this.leads.linkCustomer(actor, id, body);
  }

  @Post(':id/link-vehicle')
  @RequirePermission(Permission.VEHICLES_WRITE)
  linkVehicle(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(linkLeadVehicleSchema)) body: LinkLeadVehicleInput,
  ) {
    return this.leads.linkVehicle(actor, id, body);
  }

  @Post(':id/convert-to-os')
  @RequirePermission(Permission.OS_WRITE)
  convertToServiceOrder(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(convertLeadToServiceOrderSchema))
    body: ConvertLeadToServiceOrderInput,
  ) {
    return this.leads.convertToServiceOrder(actor, id, body);
  }
}
