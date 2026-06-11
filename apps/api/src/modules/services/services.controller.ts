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
  createServiceSchema,
  listServicesQuerySchema,
  updateServiceSchema,
  Permission,
  type CreateServiceInput,
  type ListServicesQuery,
  type UpdateServiceInput,
} from '@oficina/shared';
import { ServicesService } from './services.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Controller('services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  @RequirePermission(Permission.SERVICES_READ)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(listServicesQuerySchema))
    query: ListServicesQuery,
  ) {
    return this.services.list(actor.tenantId, query);
  }

  @Get(':id')
  @RequirePermission(Permission.SERVICES_READ)
  findOne(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.services.findOne(actor.tenantId, id);
  }

  @Post()
  @RequirePermission(Permission.SERVICES_WRITE)
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(createServiceSchema)) body: CreateServiceInput,
  ) {
    return this.services.create(actor, body);
  }

  @Put(':id')
  @RequirePermission(Permission.SERVICES_WRITE)
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateServiceSchema)) body: UpdateServiceInput,
  ) {
    return this.services.update(actor, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission(Permission.SERVICES_WRITE)
  remove(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.services.remove(actor, id);
  }
}
