import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createLeadSchema, type CreateLeadInput } from '@oficina/shared';
import { SiteService } from '../site/site.service';
import { BlogService } from '../blog/blog.service';
import { LeadsService } from '../leads/leads.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Public } from '../../common/decorators/public.decorator';

@Controller('public')
@Public()
export class PublicSiteController {
  constructor(
    private readonly site: SiteService,
    private readonly blog: BlogService,
    private readonly leads: LeadsService,
  ) {}

  @Get('site')
  async site_() {
    const data = await this.site.publicSite();
    if (!data) throw new NotFoundException('Site não publicado');
    return data;
  }

  @Get('blog')
  async blog_() {
    const tenantId = await this.site.publishedTenantId();
    if (!tenantId) return [];
    return this.blog.publicList(tenantId);
  }

  @Get('blog/:slug')
  async post(@Param('slug') slug: string) {
    const tenantId = await this.site.publishedTenantId();
    if (!tenantId) throw new NotFoundException('Artigo não encontrado');
    return this.blog.publicGetBySlug(tenantId, slug);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('lead')
  @HttpCode(201)
  async lead(@Body(new ZodValidationPipe(createLeadSchema)) body: CreateLeadInput) {
    const tenantId = await this.site.publishedTenantId();
    if (!tenantId) throw new BadRequestException('Site indisponível no momento');
    await this.leads.createFromPublic(tenantId, body);
    return { ok: true };
  }
}
