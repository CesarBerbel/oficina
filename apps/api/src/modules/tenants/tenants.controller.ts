import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  createBranchSchema,
  updatePlatformTenantSchema,
  type CreateBranchInput,
  type UpdatePlatformTenantInput,
} from '@oficina/shared';
import { TenantsService } from './tenants.service';
import { PlatformAdminGuard } from './platform-admin.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AllowAuthenticated } from '../../common/decorators/allow-authenticated.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Controller('platform/tenants')
@UseGuards(PlatformAdminGuard)
@AllowAuthenticated()
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  list() {
    return this.tenants.list();
  }

  @Post()
  @HttpCode(201)
  createBranch(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(createBranchSchema)) body: CreateBranchInput,
  ) {
    return this.tenants.createBranch(actor, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePlatformTenantSchema))
    body: UpdatePlatformTenantInput,
  ) {
    return this.tenants.setActive(actor, id, body.active);
  }

  @Delete(':id')
  @HttpCode(200)
  remove(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.tenants.remove(actor, id);
  }
}
