'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  createBlogPostSchema,
  updateBlogPostSchema,
  BLOG_STATUS_LABELS,
  BlogStatus,
  type BlogPostDto,
} from '@oficina/shared';
import { Sparkles } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import { ApiError } from '@/lib/api';
import { apiErrorMessage, zodFieldErrors } from '@/lib/form-errors';
import { useAiArticle } from '@/features/ai/use-ai';
import { ImageUpload } from '@/components/image-upload';
import { useCreateBlogPost, useUpdateBlogPost } from './use-content';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const empty = {
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  imageUrl: '',
  author: '',
  status: 'RASCUNHO',
  seoTitle: '',
  seoDescription: '',
};

const FIELD_LABELS = {
  title: 'Título',
  slug: 'Slug',
  excerpt: 'Resumo',
  content: 'Conteúdo',
  imageUrl: 'Imagem de capa',
  author: 'Autor',
  status: 'Status',
  seoTitle: 'SEO título',
  seoDescription: 'SEO descrição',
};

export function BlogFormDialog({
  open,
  onOpenChange,
  post,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  post?: BlogPostDto | null;
}) {
  const isEdit = !!post;
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [subject, setSubject] = useState('');
  const create = useCreateBlogPost();
  const update = useUpdateBlogPost(post?.id ?? '');
  const article = useAiArticle();
  const pending = create.isPending || update.isPending;

  async function generateWithAi() {
    if (subject.trim().length < 3) {
      toast.error('Informe o assunto do artigo');
      return;
    }
    try {
      const a = await article.mutateAsync({ subject });
      setForm((f) => ({
        ...f,
        title: a.title,
        excerpt: a.excerpt,
        content: a.content,
        seoTitle: a.seoTitle,
        seoDescription: a.seoDescription,
      }));
      toast.success('Artigo gerado pela IA — revise antes de publicar');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao gerar artigo');
    }
  }

  useEffect(() => {
    if (!open) return;
    setForm(
      post
        ? {
            title: post.title,
            slug: post.slug,
            excerpt: post.excerpt ?? '',
            content: post.content,
            imageUrl: post.imageUrl ?? '',
            author: post.author ?? '',
            status: post.status,
            seoTitle: post.seoTitle ?? '',
            seoDescription: post.seoDescription ?? '',
          }
        : empty,
    );
    setErrors({});
    setSubject('');
  }, [open, post]);

  function set<K extends keyof typeof empty>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const schema = isEdit ? updateBlogPostSchema : createBlogPostSchema;
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error, FIELD_LABELS));
      return;
    }
    try {
      if (isEdit) {
        await update.mutateAsync(parsed.data);
        toast.success('Artigo atualizado');
      } else {
        await create.mutateAsync(parsed.data as never);
        toast.success('Artigo criado');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, FIELD_LABELS));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar artigo' : 'Novo artigo'}</DialogTitle>
          <DialogDescription>Conteúdo e SEO do artigo do blog.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {!isEdit && (
            <div className="space-y-1.5 rounded-lg border border-dashed bg-muted/30 p-3">
              <Label className="flex items-center gap-1">
                <Sparkles className="size-3.5 text-primary" /> Gerar artigo com IA
              </Label>
              <div className="flex gap-2">
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Assunto (ex.: importância do alinhamento)"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  disabled={article.isPending}
                  onClick={generateWithAi}
                >
                  {article.isPending ? (
                    <CarLoader className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  Gerar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Preenche título, resumo, conteúdo e SEO. Revise antes de publicar.
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label required>Título</Label>
            <Input value={form.title} onChange={(e) => set('title', e.target.value)} />
            {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Slug (opcional)</Label>
              <Input
                value={form.slug}
                onChange={(e) => set('slug', e.target.value)}
                placeholder="gerado do título"
              />
            </div>
            <div className="space-y-1.5">
              <Label required>Status</Label>
              <Select
                value={form.status}
                onChange={(e) => set('status', e.target.value)}
                className="w-full"
              >
                {Object.values(BlogStatus).map((s) => (
                  <option key={s} value={s}>
                    {BLOG_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Resumo</Label>
            <Textarea
              value={form.excerpt}
              onChange={(e) => set('excerpt', e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label required>Conteúdo</Label>
            <Textarea
              value={form.content}
              onChange={(e) => set('content', e.target.value)}
              rows={8}
            />
            {errors.content && <p className="text-xs text-destructive">{errors.content}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Imagem de capa</Label>
              <ImageUpload value={form.imageUrl} onChange={(url) => set('imageUrl', url)} />
            </div>
            <div className="space-y-1.5">
              <Label>Autor</Label>
              <Input value={form.author} onChange={(e) => set('author', e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>SEO título</Label>
              <Input value={form.seoTitle} onChange={(e) => set('seoTitle', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>SEO descrição</Label>
              <Input
                value={form.seoDescription}
                onChange={(e) => set('seoDescription', e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <CarLoader className="size-4 animate-spin" />}
              {isEdit ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
