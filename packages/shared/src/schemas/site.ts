import { z } from 'zod';
import { cnpjSchema } from './common.js';

const optionalText = (max: number) =>
  z.preprocess((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value;
  }, z.string().max(max).nullable().optional());

const optionalCnpj = z
  .preprocess((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    return value;
  }, cnpjSchema.nullable().optional())
  .transform((value) => (value === undefined ? undefined : (value ?? null)));

const optionalCapacity = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    return Number(trimmed.replace(',', '.'));
  }
  return value;
}, z.number().int().min(0).max(100000).nullable().optional());

export const updateSiteSettingsSchema = z.object({
  shopName: z.string().trim().min(1).max(160).optional(),
  tagline: optionalText(200),
  about: optionalText(4000),
  aboutExtra: optionalText(4000),
  heroTitle: optionalText(160),
  heroSubtitle: optionalText(300),
  phone: optionalText(40),
  whatsapp: optionalText(40),
  email: optionalText(160),
  cnpj: optionalCnpj,
  address: optionalText(400),
  addressZip: optionalText(12),
  addressStreet: optionalText(160),
  addressNumber: optionalText(20),
  addressComplement: optionalText(120),
  addressDistrict: optionalText(80),
  addressCity: optionalText(80),
  addressState: optionalText(2),
  hours: optionalText(300),
  mapsEmbed: optionalText(2000),
  instagram: optionalText(200),
  facebook: optionalText(200),
  logoUrl: optionalText(500),
  logoPdfUrl: optionalText(500),
  // Rodapé do PDF: HTML simples (negrito/itálico/sublinhado/listas).
  pdfFooterText: optionalText(8000),
  blogFallbackImageUrl: optionalText(500),
  serviceCardImageUrl: optionalText(500),
  heroImageUrl: optionalText(500),
  capacity: optionalCapacity,
  published: z.boolean().optional(),
  // Tema do site público: true = escuro, false = claro.
  darkMode: z.boolean().optional(),
});
export type UpdateSiteSettingsInput = z.infer<typeof updateSiteSettingsSchema>;

export interface SiteSettingsDto {
  shopName: string;
  tagline: string | null;
  about: string | null;
  aboutExtra: string | null;
  heroTitle: string | null;
  heroSubtitle: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  cnpj: string | null;
  address: string | null;
  addressZip: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressDistrict: string | null;
  addressCity: string | null;
  addressState: string | null;
  hours: string | null;
  mapsEmbed: string | null;
  instagram: string | null;
  facebook: string | null;
  logoUrl: string | null;
  logoPdfUrl: string | null;
  pdfFooterText: string | null;
  blogFallbackImageUrl: string | null;
  serviceCardImageUrl: string | null;
  heroImageUrl: string | null;
  capacity: number | null;
  published: boolean;
  /** Tema do site público: true = escuro, false = claro. */
  darkMode: boolean;
}

/** Serviço exibido no site (subconjunto público do catálogo). */
export interface PublicServiceDto {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  salePrice: number;
}

export interface PublicSiteDto {
  settings: SiteSettingsDto;
  services: PublicServiceDto[];
}

/** Tags permitidas no rodapé do PDF (editor rich text simples). */
const ALLOWED_RICH_TAGS = new Set([
  'b',
  'strong',
  'i',
  'em',
  'u',
  'br',
  'p',
  'div',
  'ul',
  'ol',
  'li',
]);

/**
 * Sanitiza o HTML do rodapé do PDF: remove comentários, script/style, atributos
 * e quaisquer tags fora da lista permitida (mantendo o texto).
 */
export function sanitizeRichHtml(html: string | null | undefined): string {
  if (!html) return '';
  const noComments = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
  return noComments
    .replace(/<\/?([a-zA-Z0-9]+)[^>]*>/g, (match, tagRaw: string) => {
      const tag = tagRaw.toLowerCase();
      if (!ALLOWED_RICH_TAGS.has(tag)) return '';
      return match.startsWith('</') ? `</${tag}>` : `<${tag}>`;
    })
    .trim();
}

/** Monta o endereço composto (para exibição) a partir dos campos estruturados. */
export function composeAddress(parts: {
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  addressDistrict?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressZip?: string | null;
}): string | null {
  const v = (s?: string | null) => (s ?? '').trim();
  const streetLine = [v(parts.addressStreet), v(parts.addressNumber)].filter(Boolean).join(', ');
  const withComplement = [streetLine, v(parts.addressComplement)].filter(Boolean).join(' - ');
  const cityUf = [v(parts.addressCity), v(parts.addressState)].filter(Boolean).join('/');
  const cep = v(parts.addressZip) ? `CEP ${v(parts.addressZip)}` : '';
  const composed = [withComplement, v(parts.addressDistrict), cityUf, cep]
    .filter(Boolean)
    .join(' - ');
  return composed || null;
}
