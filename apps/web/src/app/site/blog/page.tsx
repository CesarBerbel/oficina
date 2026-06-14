import Link from 'next/link';
import type { Metadata } from 'next';
import { getPublicBlog, getPublicSite } from '@/lib/public-api';
import { BLOG_FALLBACK_IMAGE } from '@/lib/blog';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = { title: 'Blog' };

export default async function SiteBlog() {
  const [posts, site] = await Promise.all([
    getPublicBlog().then((p) => p ?? []),
    getPublicSite(),
  ]);
  const fallback = site?.settings.blogFallbackImageUrl || BLOG_FALLBACK_IMAGE;

  return (
    <div className="container py-16">
      <h1 className="text-3xl font-bold tracking-tight">Blog</h1>
      <p className="mt-1 text-muted-foreground">Dicas e novidades.</p>

      {posts.length === 0 ? (
        <p className="mt-10 text-muted-foreground">Nenhum artigo publicado ainda.</p>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (
            <Link key={p.slug} href={`/site/blog/${p.slug}`} className="group rounded-xl border bg-card p-5 transition-colors hover:border-primary">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.imageUrl || fallback}
                alt={p.title}
                className="mb-3 h-40 w-full rounded-lg object-cover"
              />
              <h2 className="font-semibold group-hover:text-primary">{p.title}</h2>
              {p.excerpt && <p className="mt-1 text-sm text-muted-foreground">{p.excerpt}</p>}
              <p className="mt-3 text-xs text-muted-foreground">
                {p.author ? `${p.author} · ` : ''}
                {p.publishedAt ? new Date(p.publishedAt).toLocaleDateString('pt-BR') : ''}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
