import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  appointmentActionSchema,
  convertLeadToServiceOrderSchema,
  createReceptionScheduleBlockSchema,
  createDirectReceptionLeadSchema,
  linkLeadCustomerSchema,
  linkLeadVehicleSchema,
  listLeadsQuerySchema,
  listReceptionScheduleBlocksQuerySchema,
  registerLeadContactSchema,
  scheduleLeadSchema,
  updateLeadStatusSchema,
  Permission,
  type AppointmentActionInput,
  type ConvertLeadToServiceOrderInput,
  type CreateReceptionScheduleBlockInput,
  type CreateDirectReceptionLeadInput,
  type LinkLeadCustomerInput,
  type LinkLeadVehicleInput,
  type ListLeadsQuery,
  type ListReceptionScheduleBlocksQuery,
  type RegisterLeadContactInput,
  type ScheduleLeadInput,
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

  @Post('direct-reception')
  @RequirePermission(Permission.CUSTOMERS_WRITE)
  createDirectReception(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(createDirectReceptionLeadSchema))
    body: CreateDirectReceptionLeadInput,
  ) {
    return this.leads.createDirectReception(actor, body);
  }


  @Get('schedule-blocks')
  @RequirePermission(Permission.CUSTOMERS_READ)
  scheduleBlocks(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(listReceptionScheduleBlocksQuerySchema))
    query: ListReceptionScheduleBlocksQuery,
  ) {
    return this.leads.listScheduleBlocks(actor.tenantId, query);
  }

  @Post('schedule-blocks')
  @RequirePermission(Permission.CUSTOMERS_WRITE)
  createScheduleBlock(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(createReceptionScheduleBlockSchema))
    body: CreateReceptionScheduleBlockInput,
  ) {
    return this.leads.createScheduleBlock(actor, body);
  }

  @Delete('schedule-blocks/:id')
  @HttpCode(204)
  @RequirePermission(Permission.CUSTOMERS_WRITE)
  deleteScheduleBlock(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.leads.deleteScheduleBlock(actor, id);
  }

  @Get('reception-alerts')
  @RequirePermission(Permission.CUSTOMERS_READ)
  receptionAlerts(@CurrentUser() actor: AuthenticatedUser) {
    return this.leads.receptionAlerts(actor.tenantId);
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

  @Post(':id/schedule')
  @RequirePermission(Permission.CUSTOMERS_WRITE)
  schedule(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(scheduleLeadSchema)) body: ScheduleLeadInput,
  ) {
    return this.leads.schedule(actor, id, body);
  }

  @Post(':id/confirm-appointment')
  @RequirePermission(Permission.CUSTOMERS_WRITE)
  confirmAppointment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(appointmentActionSchema)) body: AppointmentActionInput,
  ) {
    return this.leads.confirmAppointment(actor, id, body);
  }

  @Post(':id/check-in')
  @RequirePermission(Permission.CUSTOMERS_WRITE)
  checkIn(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(appointmentActionSchema)) body: AppointmentActionInput,
  ) {
    return this.leads.checkIn(actor, id, body);
  }

  @Post(':id/no-show')
  @RequirePermission(Permission.CUSTOMERS_WRITE)
  noShow(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(appointmentActionSchema)) body: AppointmentActionInput,
  ) {
    return this.leads.noShow(actor, id, body);
  }

  @Post(':id/cancel-check-in')
  @RequirePermission(Permission.CUSTOMERS_WRITE)
  cancelCheckIn(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(appointmentActionSchema)) body: AppointmentActionInput,
  ) {
    return this.leads.cancelCheckIn(actor, id, body);
  }

  @Post(':id/cancel-appointment')
  @RequirePermission(Permission.CUSTOMERS_WRITE)
  cancelAppointment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(appointmentActionSchema)) body: AppointmentActionInput,
  ) {
    return this.leads.cancelAppointment(actor, id, body);
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
