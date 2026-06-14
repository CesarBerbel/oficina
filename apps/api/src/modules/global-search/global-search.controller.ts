import { Controller, Get, Query } from '@nestjs/common';
import {
  globalSearchQuerySchema,
  Permission,
  type GlobalSearchQuery,
} from '@oficina/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { GlobalSearchService } from './global-search.service';

@Controller('global-search')
export class GlobalSearchController {
  constructor(private readonly globalSearch: GlobalSearchService) {}

  @Get()
  @RequirePermission(Permission.DASHBOARD_READ)
  search(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(globalSearchQuerySchema)) query: GlobalSearchQuery,
  ) {
    return this.globalSearch.search(actor.tenantId, query);
  }
}
