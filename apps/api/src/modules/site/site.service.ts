import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  PublicSiteDto,
  SiteSettingsDto,
  UpdateSiteSettingsInput,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const dec = (v: Prisma.Decimal | number | null | undefined): number =>
  v == null ? 0 : Number(v);

export interface PublicTenantLookup {
  tenantSlug?: string | null;
  host?: string | null;
}

@Injectable()
export class SiteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private toDto(s: Prisma.SiteSettingsGetPayload<object>): SiteSettingsDto {
    return {
      shopName: s.shopName,
      tagline: s.tagline,
      about: s.about,
      aboutExtra: s.aboutExtra,
      heroTitle: s.heroTitle,
      heroSubtitle: s.heroSubtitle,
      phone: s.phone,
      whatsapp: s.whatsapp,
      email: s.email,
      cnpj: s.cnpj,
      address: s.address,
      hours: s.hours,
      mapsEmbed: s.mapsEmbed,
      instagram: s.instagram,
      facebook: s.facebook,
      logoUrl: s.logoUrl,
      logoPdfUrl: s.logoPdfUrl,
      pdfFooterText: s.pdfFooterText,
      blogFallbackImageUrl: s.blogFallbackImageUrl,
      serviceCardImageUrl: s.serviceCardImageUrl,
      heroImageUrl: s.heroImageUrl,
      capacity: s.capacity,
      published: s.published,
    };
  }

  /** Retorna as configurações, criando padrão a partir da oficina se não existir. */
  async getOrCreate(tenantId: string) {
    const existing = await this.prisma.siteSettings.findUnique({ where: { tenantId } });
    if (existing) return existing;
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    return this.prisma.siteSettings.create({
      data: { tenantId, shopName: tenant.name, cnpj: tenant.cnpj ?? null },
    });
  }

  async get(tenantId: string): Promise<SiteSettingsDto> {
    return this.toDto(await this.getOrCreate(tenantId));
  }

  /**
   * Sanitiza o embed do Google Maps: extrai apenas a URL de embed confiável e
   * reconstrói um iframe seguro (evita XSS via dangerouslySetInnerHTML).
   */
  private sanitizeMapsEmbed(value: string | null | undefined): string | null {
    if (!value) return null;
    const match = value.match(/https:\/\/www\.google\.com\/maps\/embed\?[^"'\s<>]+/i);
    if (!match) return null;
    const src = match[0].replace(/"/g, '&quot;');
    return `<iframe src="${src}" width="100%" height="360" style="border:0" allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
  }

  async update(
    actor: AuthenticatedUser,
    input: UpdateSiteSettingsInput,
  ): Promise<SiteSettingsDto> {
    await this.getOrCreate(actor.tenantId);
    const data = {
      ...input,
      ...(input.mapsEmbed !== undefined
        ? { mapsEmbed: this.sanitizeMapsEmbed(input.mapsEmbed) }
        : {}),
    };
    const updated = await this.prisma.siteSettings.update({
      where: { tenantId: actor.tenantId },
      data,
    });
    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'UPDATE',
      module: 'site',
      entity: 'SiteSettings',
      entityId: updated.id,
    });
    return this.toDto(updated);
  }

  private normalizeSlug(value: string | null | undefined): string | null {
    const slug = value?.trim().toLowerCase();
    return slug && /^[a-z0-9][a-z0-9-]{1,62}$/.test(slug) ? slug : null;
  }

  private slugFromHost(host: string | null | undefined): string | null {
    const normalized = host?.split(',')[0]?.trim().toLowerCase().split(':')[0];
    if (!normalized) return null;
    if (
      normalized === 'localhost' ||
      normalized === '127.0.0.1' ||
      normalized === '0.0.0.0' ||
      /^\d+\.\d+\.\d+\.\d+$/.test(normalized)
    ) {
      return null;
    }

    const labels = normalized.split('.').filter(Boolean);
    const first = labels[0] === 'www' ? labels[1] : labels[0];
    return this.normalizeSlug(first);
  }

  private async findPublishedTenantBySlug(slug: string): Promise<string | null> {
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        slug,
        active: true,
        siteSettings: { published: true },
      },
      select: { id: true },
    });
    return tenant?.id ?? null;
  }

  private async singlePublishedTenantId(): Promise<string | null> {
    // Compatibilidade com instalações single-tenant: se houver exatamente um
    // site publicado, usa esse tenant. Com múltiplos sites publicados, exige
    // slug/header/host para evitar expor conteúdo da oficina errada.
    const published = await this.prisma.siteSettings.findMany({
      where: { published: true, tenant: { active: true } },
      orderBy: { updatedAt: 'desc' },
      select: { tenantId: true },
      take: 2,
    });
    return published.length === 1 ? published[0].tenantId : null;
  }

  private async resolvePublishedTenantId(
    lookup?: PublicTenantLookup,
  ): Promise<string | null> {
    const explicitSlug = this.normalizeSlug(lookup?.tenantSlug);
    const hostSlug = this.slugFromHost(lookup?.host);

    // Prioriza o slug explícito configurado no deploy/header/query. Se não
    // existir, tenta o slug inferido do host. Se nenhum bater, ainda permite
    // produção single-tenant com domínio próprio que não corresponde ao slug
    // cadastrado da oficina.
    const slugs = Array.from(new Set([explicitSlug, hostSlug].filter(Boolean))) as string[];
    for (const slug of slugs) {
      const tenantId = await this.findPublishedTenantBySlug(slug);
      if (tenantId) return tenantId;
    }

    return this.singlePublishedTenantId();
  }

  /** Dados públicos do site resolvendo a oficina por slug/header/host. */
  async publicSite(lookup?: PublicTenantLookup): Promise<PublicSiteDto | null> {
    const tenantId = await this.resolvePublishedTenantId(lookup);
    if (!tenantId) return null;

    const settings = await this.prisma.siteSettings.findFirst({
      where: { tenantId, published: true, tenant: { active: true } },
    });
    if (!settings) return null;
    const services = await this.prisma.service.findMany({
      where: { tenantId: settings.tenantId, active: true, showOnSite: true },
      orderBy: { name: 'asc' },
      take: 60,
      select: { id: true, name: true, description: true, category: true, salePrice: true },
    });
    return {
      settings: this.toDto(settings),
      services: services.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        category: s.category,
        salePrice: dec(s.salePrice),
      })),
    };
  }

  /** Tenant da oficina publicada (para leads/blog públicos). */
  async publishedTenantId(lookup?: PublicTenantLookup): Promise<string | null> {
    return this.resolvePublishedTenantId(lookup);
  }
}
