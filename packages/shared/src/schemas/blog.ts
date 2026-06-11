import { z } from 'zod';
import { BlogStatus } from '../enums/lead.js';
import { paginationQuerySchema } from './common.js';

const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));

export const createBlogPostSchema = z.object({
  title: z.string().trim().min(2, 'Informe o título').max(200),
  slug: opt(200),
  excerpt: opt(500),
  content: z.string().trim().min(1, 'Informe o conteúdo'),
  imageUrl: opt(500),
  author: opt(120),
  status: z.nativeEnum(BlogStatus).default(BlogStatus.RASCUNHO),
  seoTitle: opt(200),
  seoDescription: opt(300),
});
export type CreateBlogPostInput = z.infer<typeof createBlogPostSchema>;

export const updateBlogPostSchema = createBlogPostSchema.partial();
export type UpdateBlogPostInput = z.infer<typeof updateBlogPostSchema>;

export const listBlogPostsQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(BlogStatus).optional(),
});
export type ListBlogPostsQuery = z.infer<typeof listBlogPostsQuerySchema>;

export interface BlogPostDto {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  imageUrl: string | null;
  author: string | null;
  status: BlogStatus;
  publishedAt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  createdAt: string;
}

/** Versão pública (lista) sem o conteúdo completo. */
export interface PublicBlogSummaryDto {
  title: string;
  slug: string;
  excerpt: string | null;
  imageUrl: string | null;
  author: string | null;
  publishedAt: string | null;
}
