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

  /** Dados públicos do site (primeira oficina publicada). */
  async publicSite(): Promise<PublicSiteDto | null> {
    const settings = await this.prisma.siteSettings.findFirst({
      where: { published: true },
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
  async publishedTenantId(): Promise<string | null> {
    const s = await this.prisma.siteSettings.findFirst({
      where: { published: true },
      select: { tenantId: true },
    });
    return s?.tenantId ?? null;
  }
}
