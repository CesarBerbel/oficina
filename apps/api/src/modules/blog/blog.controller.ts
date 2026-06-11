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
  createBlogPostSchema,
  listBlogPostsQuerySchema,
  updateBlogPostSchema,
  Permission,
  type CreateBlogPostInput,
  type ListBlogPostsQuery,
  type UpdateBlogPostInput,
} from '@oficina/shared';
import { BlogService } from './blog.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Controller('blog')
export class BlogController {
  constructor(private readonly blog: BlogService) {}

  @Get()
  @RequirePermission(Permission.BLOG_WRITE)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(listBlogPostsQuerySchema)) query: ListBlogPostsQuery,
  ) {
    return this.blog.list(actor.tenantId, query);
  }

  @Get(':id')
  @RequirePermission(Permission.BLOG_WRITE)
  findOne(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.blog.findOne(actor.tenantId, id);
  }

  @Post()
  @RequirePermission(Permission.BLOG_WRITE)
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(createBlogPostSchema)) body: CreateBlogPostInput,
  ) {
    return this.blog.create(actor, body);
  }

  @Put(':id')
  @RequirePermission(Permission.BLOG_WRITE)
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBlogPostSchema)) body: UpdateBlogPostInput,
  ) {
    return this.blog.update(actor, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission(Permission.BLOG_WRITE)
  remove(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.blog.remove(actor, id);
  }
}
