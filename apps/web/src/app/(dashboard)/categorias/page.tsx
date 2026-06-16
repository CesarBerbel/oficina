'use client';

import { useState } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import {
  CATEGORY_KINDS,
  CATEGORY_KIND_LABELS,
  type CategoryDto,
  type CategoryKind,
} from '@oficina/shared';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from '@/features/categories/use-categories';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export default function CategoriesPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('settings:manage');
  const [kind, setKind] = useState<CategoryKind>('CUSTOMER');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Categorias</h1>
        <p className="text-muted-foreground">
          Categorias de clientes, serviços e peças usadas nos cadastros.
        </p>
      </div>

      <div className="flex gap-1 border-b">
        {CATEGORY_KINDS.map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              kind === k
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {CATEGORY_KIND_LABELS[k]}
          </button>
        ))}
      </div>

      <KindTab kind={kind} canManage={canManage} />
    </div>
  );
}

function KindTab({ kind, canManage }: { kind: CategoryKind; canManage: boolean }) {
  const { data, isLoading } = useCategories(kind);
  const create = useCreateCategory();
  const [name, setName] = useState('');
  const items = data ?? [];

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const value = name.trim();
    if (!value) return;
    try {
      await create.mutateAsync({ kind, name: value, active: true });
      setName('');
      toast.success('Categoria adicionada');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao adicionar');
    }
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <form onSubmit={add} className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Nova categoria de ${CATEGORY_KIND_LABELS[kind].toLowerCase()}`}
            maxLength={60}
            className="max-w-sm"
          />
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? <CarLoader className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Adicionar
          </Button>
        </form>
      )}

      <div className="rounded-xl border divide-y">
        {isLoading ? (
          <div className="grid h-24 place-items-center">
            <CarLoader className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma categoria cadastrada.
          </p>
        ) : (
          items.map((c) => <CategoryRow key={c.id} category={c} canManage={canManage} />)
        )}
      </div>
    </div>
  );
}

function CategoryRow({ category, canManage }: { category: CategoryDto; canManage: boolean }) {
  const update = useUpdateCategory(category.id);
  const del = useDeleteCategory();
  const confirm = useConfirm();
  const [name, setName] = useState(category.name);
  const dirty = name.trim() !== category.name && name.trim().length > 0;

  async function save() {
    try {
      await update.mutateAsync({ name: name.trim() });
      toast.success('Categoria atualizada');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao salvar');
    }
  }

  async function toggleActive() {
    try {
      await update.mutateAsync({ active: !category.active });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro');
    }
  }

  async function remove() {
    const ok = await confirm({
      title: 'Excluir categoria',
      description: `Excluir a categoria "${category.name}"? Esta ação não pode ser desfeita.`,
      destructive: true,
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await del.mutateAsync(category.id);
      toast.success('Categoria excluída');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao excluir');
    }
  }

  if (!canManage) {
    return (
      <div className="flex items-center justify-between px-4 py-2.5 text-sm">
        <span>{category.name}</span>
        {!category.active && <Badge variant="secondary">inativa</Badge>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        className="h-9 max-w-sm"
      />
      {dirty && (
        <Button size="sm" variant="outline" onClick={save} disabled={update.isPending}>
          <Save className="size-4" /> Salvar
        </Button>
      )}
      <button
        type="button"
        onClick={toggleActive}
        className="ml-auto"
        aria-label={category.active ? 'Desativar' : 'Ativar'}
      >
        <Badge variant={category.active ? 'success' : 'secondary'}>
          {category.active ? 'ativa' : 'inativa'}
        </Badge>
      </button>
      <Button size="icon" variant="ghost" onClick={remove} aria-label="Excluir">
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}
