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
  createVehicleSchema,
  listVehiclesQuerySchema,
  updateVehicleSchema,
  Permission,
  type CreateVehicleInput,
  type ListVehiclesQuery,
  type UpdateVehicleInput,
} from '@oficina/shared';
import { VehiclesService } from './vehicles.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get()
  @RequirePermission(Permission.VEHICLES_READ)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(listVehiclesQuerySchema))
    query: ListVehiclesQuery,
  ) {
    return this.vehicles.list(actor.groupId, query);
  }

  @Get(':id')
  @RequirePermission(Permission.VEHICLES_READ)
  findOne(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.vehicles.findOne(actor.groupId, id);
  }

  @Post()
  @RequirePermission(Permission.VEHICLES_WRITE)
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(createVehicleSchema)) body: CreateVehicleInput,
  ) {
    return this.vehicles.create(actor, body);
  }

  @Put(':id')
  @RequirePermission(Permission.VEHICLES_WRITE)
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateVehicleSchema)) body: UpdateVehicleInput,
  ) {
    return this.vehicles.update(actor, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission(Permission.VEHICLES_WRITE)
  remove(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.vehicles.remove(actor, id);
  }
}
