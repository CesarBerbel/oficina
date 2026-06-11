'use client';

import { useState } from 'react';
import { Plus, Loader2, MoreHorizontal, Pencil, Trash2, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { BLOG_STATUS_LABELS, type BlogPostDto, type BlogStatus } from '@oficina/shared';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useBlogPosts, useDeleteBlogPost } from '@/features/content/use-content';
import { BlogFormDialog } from '@/features/content/blog-form-dialog';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const VARIANT: Record<BlogStatus, BadgeProps['variant']> = {
  PUBLICADO: 'success',
  RASCUNHO: 'secondary',
};

export default function BlogAdminPage() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('blog:write');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BlogPostDto | null>(null);
  const { data, isLoading } = useBlogPosts({ page, pageSize: 10 });
  const del = useDeleteBlogPost();
  const posts = data?.data ?? [];
  const meta = data?.meta;

  async function handleDelete(p: BlogPostDto) {
    if (!confirm(`Excluir "${p.title}"?`)) return;
    try { await del.mutateAsync(p.id); toast.success('Artigo excluído'); }
    catch (err) { toast.error(err instanceof ApiError ? err.message : 'Erro'); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Blog</h1>
          <p className="text-muted-foreground">Artigos do site público.</p>
        </div>
        {canWrite && (
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="size-4" /> Novo artigo
          </Button>
        )}
      </div>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Publicado em</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="h-24 text-center"><Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" /></TableCell></TableRow>
            ) : posts.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">Nenhum artigo.</TableCell></TableRow>
            ) : (
              posts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.title}
                    <span className="block text-xs font-normal text-muted-foreground">/{p.slug}</span>
                  </TableCell>
                  <TableCell><Badge variant={VARIANT[p.status]}>{BLOG_STATUS_LABELS[p.status]}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{p.publishedAt ? formatDate(p.publishedAt) : '—'}</TableCell>
                  <TableCell>
                    {canWrite && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setEditing(p); setOpen(true); }}><Pencil className="size-4" /> Editar</DropdownMenuItem>
                          {p.status === 'PUBLICADO' && (
                            <DropdownMenuItem asChild>
                              <Link href={`/site/blog/${p.slug}`} target="_blank"><ExternalLink className="size-4" /> Ver no site</Link>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleDelete(p)}><Trash2 className="size-4" /> Excluir</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{meta.total} artigo(s)</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
          </div>
        </div>
      )}

      <BlogFormDialog open={open} onOpenChange={setOpen} post={editing} />
    </div>
  );
}
