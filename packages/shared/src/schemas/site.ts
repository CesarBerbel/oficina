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
  .transform((value) => (value === undefined ? undefined : value ?? null));


const optionalCategoryList = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value
      .split(/[\n,;]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return value;
}, z.array(z.string().trim().min(1, 'Categoria: informe o nome da categoria').max(40, 'Categoria: use no máximo 40 caracteres')).max(50, 'Categorias de clientes: cadastre no máximo 50 categorias').optional());

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
  heroTitle: optionalText(160),
  heroSubtitle: optionalText(300),
  phone: optionalText(40),
  whatsapp: optionalText(40),
  email: optionalText(160),
  cnpj: optionalCnpj,
  address: optionalText(300),
  hours: optionalText(300),
  mapsEmbed: optionalText(2000),
  instagram: optionalText(200),
  facebook: optionalText(200),
  logoUrl: optionalText(500),
  logoPdfUrl: optionalText(500),
  pdfFooterText: optionalText(2000),
  capacity: optionalCapacity,
  customerCategories: optionalCategoryList,
  published: z.boolean().optional(),
});
export type UpdateSiteSettingsInput = z.infer<typeof updateSiteSettingsSchema>;

export interface SiteSettingsDto {
  shopName: string;
  tagline: string | null;
  about: string | null;
  heroTitle: string | null;
  heroSubtitle: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  cnpj: string | null;
  address: string | null;
  hours: string | null;
  mapsEmbed: string | null;
  instagram: string | null;
  facebook: string | null;
  logoUrl: string | null;
  logoPdfUrl: string | null;
  pdfFooterText: string | null;
  capacity: number | null;
  customerCategories: string[];
  published: boolean;
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
