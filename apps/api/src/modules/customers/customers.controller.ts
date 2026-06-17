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
  createCustomerSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
  Permission,
  type CreateCustomerInput,
  type ListCustomersQuery,
  type UpdateCustomerInput,
} from '@oficina/shared';
import { CustomersService } from './customers.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermission(Permission.CUSTOMERS_READ)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(listCustomersQuerySchema))
    query: ListCustomersQuery,
  ) {
    return this.customers.list(actor.groupId, query);
  }



  @Get(':id/360')
  @RequirePermission(Permission.CUSTOMERS_READ)
  find360(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.customers.find360(actor, id);
  }

  @Get(':id')
  @RequirePermission(Permission.CUSTOMERS_READ)
  findOne(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.customers.findOne(actor.groupId, id);
  }

  @Post()
  @RequirePermission(Permission.CUSTOMERS_WRITE)
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(createCustomerSchema)) body: CreateCustomerInput,
  ) {
    return this.customers.create(actor, body);
  }

  @Put(':id')
  @RequirePermission(Permission.CUSTOMERS_WRITE)
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCustomerSchema)) body: UpdateCustomerInput,
  ) {
    return this.customers.update(actor, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission(Permission.CUSTOMERS_WRITE)
  remove(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.customers.remove(actor, id);
  }
}
