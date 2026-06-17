import { headers } from 'next/headers';
import type { BlogPostDto, PublicBlogSummaryDto, PublicSiteDto } from '@oficina/shared';

// Em SSR (server components), prefere a URL interna (ex.: http://api:3333/api
// dentro do Docker); cai para a pública/local quando não definida.
const API_URL =
  process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

async function publicHeaders(): Promise<HeadersInit> {
  const incoming = await headers();
  const host = incoming.get('x-forwarded-host') ?? incoming.get('host') ?? undefined;
  const tenantSlug = process.env.NEXT_PUBLIC_SITE_TENANT_SLUG;

  return {
    ...(host ? { 'X-Public-Host': host } : {}),
    ...(tenantSlug ? { 'X-Public-Tenant-Slug': tenantSlug } : {}),
  };
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      cache: 'no-store',
      headers: await publicHeaders(),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const getPublicSite = () => getJson<PublicSiteDto>('/public/site');
export const getPublicBlog = () => getJson<PublicBlogSummaryDto[]>('/public/blog');
export const getPublicPost = (slug: string) =>
  getJson<BlogPostDto>(`/public/blog/${encodeURIComponent(slug)}`);
