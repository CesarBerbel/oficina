import { z } from 'zod';

export const globalSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(80),
  limit: z.coerce.number().int().min(1).max(12).default(6),
});

export type GlobalSearchQuery = z.infer<typeof globalSearchQuerySchema>;

export const GlobalSearchEntityType = {
  CUSTOMER: 'CUSTOMER',
  VEHICLE: 'VEHICLE',
  SERVICE_ORDER: 'SERVICE_ORDER',
  LEAD: 'LEAD',
  PART: 'PART',
  SERVICE: 'SERVICE',
} as const;

export type GlobalSearchEntityType =
  (typeof GlobalSearchEntityType)[keyof typeof GlobalSearchEntityType];

export const GLOBAL_SEARCH_ENTITY_LABELS: Record<GlobalSearchEntityType, string> = {
  CUSTOMER: 'Cliente',
  VEHICLE: 'Veículo',
  SERVICE_ORDER: 'OS',
  LEAD: 'Recepção',
  PART: 'Peça',
  SERVICE: 'Serviço',
};

export interface GlobalSearchResultDto {
  id: string;
  type: GlobalSearchEntityType;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  badge?: string | null;
  href: string;
  score: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface GlobalSearchResponseDto {
  query: string;
  total: number;
  results: GlobalSearchResultDto[];
}
