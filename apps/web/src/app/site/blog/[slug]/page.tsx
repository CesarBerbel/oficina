import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPublicPost, getPublicSite } from '@/lib/public-api';
import { BLOG_FALLBACK_IMAGE } from '@/lib/blog';
import { BackButton } from '@/components/back-button';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublicPost(slug);
  if (!post) return { title: 'Artigo' };
  return {
    title: post.seoTitle ?? post.title,
    description: post.seoDescription ?? post.excerpt ?? undefined,
  };
}

export default async function BlogPost({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [post, site] = await Promise.all([getPublicPost(slug), getPublicSite()]);
  if (!post) notFound();
  const fallback = site?.settings.blogFallbackImageUrl || BLOG_FALLBACK_IMAGE;

  return (
    <article className="container py-16">
      <BackButton
        fallbackHref="/site/blog"
        label="Voltar ao blog"
        variant="ghost"
        className="mb-6 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
      />
      <h1 className="text-3xl font-bold tracking-tight">{post.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {post.author ? `${post.author} · ` : ''}
        {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString('pt-BR') : ''}
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={post.imageUrl || fallback}
        alt={post.title}
        className="mt-6 w-full rounded-xl object-cover"
      />
      <div className="mt-6 whitespace-pre-wrap text-pretty leading-relaxed">
        {post.content}
      </div>
    </article>
  );
}
