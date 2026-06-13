import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  BlogPostDto,
  CreateBlogPostInput,
  ListBlogPostsQuery,
  Paginated,
  PublicBlogSummaryDto,
  UpdateBlogPostInput,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 200);
}

@Injectable()
export class BlogService {
  constructor(private readonly prisma: PrismaService) {}

  private toDto(p: Prisma.BlogPostGetPayload<object>): BlogPostDto {
    return {
      id: p.id,
      title: p.title,
      slug: p.slug,
      excerpt: p.excerpt,
      content: p.content,
      imageUrl: p.imageUrl,
      author: p.author,
      status: p.status,
      publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
      seoTitle: p.seoTitle,
      seoDescription: p.seoDescription,
      createdAt: p.createdAt.toISOString(),
    };
  }

  async list(
    tenantId: string,
    query: ListBlogPostsQuery,
  ): Promise<Paginated<BlogPostDto>> {
    const { page, pageSize, search, status } = query;
    const where: Prisma.BlogPostWhereInput = {
      tenantId,
      ...(status ? { status } : {}),
      ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.blogPost.count({ where }),
      this.prisma.blogPost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map((p) => this.toDto(p)),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  async findOne(tenantId: string, id: string): Promise<BlogPostDto> {
    const post = await this.prisma.blogPost.findFirst({ where: { id, tenantId } });
    if (!post) throw new NotFoundException('Artigo não encontrado');
    return this.toDto(post);
  }

  private async uniqueSlug(tenantId: string, base: string, ignoreId?: string): Promise<string> {
    let slug = base || 'artigo';
    let n = 1;
    while (true) {
      const clash = await this.prisma.blogPost.findFirst({
        where: { tenantId, slug, ...(ignoreId ? { NOT: { id: ignoreId } } : {}) },
        select: { id: true },
      });
      if (!clash) return slug;
      n += 1;
      slug = `${base}-${n}`;
    }
  }

  async create(
    actor: AuthenticatedUser,
    input: CreateBlogPostInput,
  ): Promise<BlogPostDto> {
    const slug = await this.uniqueSlug(
      actor.tenantId,
      input.slug ? slugify(input.slug) : slugify(input.title),
    );
    const post = await this.prisma.blogPost.create({
      data: {
        tenantId: actor.tenantId,
        title: input.title,
        slug,
        excerpt: input.excerpt ?? null,
        content: input.content,
        imageUrl: input.imageUrl ?? null,
        author: input.author ?? null,
        status: input.status,
        seoTitle: input.seoTitle ?? null,
        seoDescription: input.seoDescription ?? null,
        publishedAt: input.status === 'PUBLICADO' ? new Date() : null,
      },
    });
    return this.toDto(post);
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    input: UpdateBlogPostInput,
  ): Promise<BlogPostDto> {
    const current = await this.prisma.blogPost.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!current) throw new NotFoundException('Artigo não encontrado');

    let slug = current.slug;
    if (input.slug) slug = await this.uniqueSlug(actor.tenantId, slugify(input.slug), id);

    const becomingPublished =
      input.status === 'PUBLICADO' && current.status !== 'PUBLICADO';

    const updated = await this.prisma.blogPost.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        slug,
        ...(input.excerpt !== undefined ? { excerpt: input.excerpt ?? null } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl ?? null } : {}),
        ...(input.author !== undefined ? { author: input.author ?? null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.seoTitle !== undefined ? { seoTitle: input.seoTitle ?? null } : {}),
        ...(input.seoDescription !== undefined
          ? { seoDescription: input.seoDescription ?? null }
          : {}),
        ...(becomingPublished ? { publishedAt: new Date() } : {}),
      },
    });
    return this.toDto(updated);
  }

  async remove(actor: AuthenticatedUser, id: string): Promise<void> {
    await this.prisma.blogPost.deleteMany({ where: { id, tenantId: actor.tenantId } });
  }

  // ─── Público ───
  async publicList(tenantId: string): Promise<PublicBlogSummaryDto[]> {
    const rows = await this.prisma.blogPost.findMany({
      where: { tenantId, status: 'PUBLICADO' },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    });
    return rows.map((p) => ({
      title: p.title,
      slug: p.slug,
      excerpt: p.excerpt,
      imageUrl: p.imageUrl,
      author: p.author,
      publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    }));
  }

  async publicGetBySlug(tenantId: string, slug: string): Promise<BlogPostDto> {
    const post = await this.prisma.blogPost.findFirst({
      where: { tenantId, slug, status: 'PUBLICADO' },
    });
    if (!post) throw new NotFoundException('Artigo não encontrado');
    return this.toDto(post);
  }
}
