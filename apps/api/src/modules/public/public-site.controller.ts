import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { createLeadSchema, type CreateLeadInput } from '@oficina/shared';
import { SiteService, type PublicTenantLookup } from '../site/site.service';
import { BlogService } from '../blog/blog.service';
import { LeadsService } from '../leads/leads.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Public } from '../../common/decorators/public.decorator';

const NO_STORE = 'no-store, no-cache, must-revalidate, proxy-revalidate';

@Controller('public')
@Public()
export class PublicSiteController {
  constructor(
    private readonly site: SiteService,
    private readonly blog: BlogService,
    private readonly leads: LeadsService,
  ) {}

  private firstHeader(value: string | string[] | undefined): string | null {
    return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
  }

  private lookup(req: Request, tenantSlug?: string): PublicTenantLookup {
    const querySlug =
      typeof req.query.tenantSlug === 'string' ? req.query.tenantSlug : null;
    return {
      tenantSlug:
        tenantSlug ??
        querySlug ??
        this.firstHeader(req.headers['x-public-tenant-slug']),
      host:
        this.firstHeader(req.headers['x-public-host']) ??
        this.firstHeader(req.headers['x-forwarded-host']) ??
        req.get('host') ??
        null,
    };
  }

  @Get('site')
  @Header('Cache-Control', NO_STORE)
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async site_(@Req() req: Request) {
    const data = await this.site.publicSite(this.lookup(req));
    if (!data) throw new NotFoundException('Site não publicado');
    return data;
  }

  @Get('site/by-slug/:tenantSlug')
  @Header('Cache-Control', NO_STORE)
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async siteBySlug(@Req() req: Request, @Param('tenantSlug') tenantSlug: string) {
    const data = await this.site.publicSite(this.lookup(req, tenantSlug));
    if (!data) throw new NotFoundException('Site não publicado');
    return data;
  }

  @Get('blog')
  @Header('Cache-Control', NO_STORE)
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async blog_(@Req() req: Request) {
    const tenantId = await this.site.publishedTenantId(this.lookup(req));
    if (!tenantId) return [];
    return this.blog.publicList(tenantId);
  }

  @Get('blog/:slug')
  @Header('Cache-Control', NO_STORE)
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async post(@Req() req: Request, @Param('slug') slug: string) {
    const tenantId = await this.site.publishedTenantId(this.lookup(req));
    if (!tenantId) throw new NotFoundException('Artigo não encontrado');
    return this.blog.publicGetBySlug(tenantId, slug);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('lead')
  @HttpCode(201)
  async lead(
    @Req() req: Request,
    @Query('tenantSlug') tenantSlug: string | undefined,
    @Body(new ZodValidationPipe(createLeadSchema)) body: CreateLeadInput,
  ) {
    const tenantId = await this.site.publishedTenantId(this.lookup(req, tenantSlug));
    if (!tenantId) throw new BadRequestException('Site indisponível no momento');
    await this.leads.createFromPublic(tenantId, body);
    return { ok: true };
  }
}
