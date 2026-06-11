'use client';

import { useState } from 'react';
import { Plus, Loader2, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ComboDto } from '@oficina/shared';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useCombos, useDeleteCombo } from '@/features/catalog/use-catalog';
import { ComboFormDialog } from '@/features/catalog/combo-form-dialog';
import { CatalogTabs } from '@/features/catalog/catalog-tabs';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function CombosPage() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('combos:write');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ComboDto | null>(null);

  const { data, isLoading } = useCombos({ page: 1, pageSize: 50 });
  const del = useDeleteCombo();
  const combos = data?.data ?? [];

  async function handleDelete(c: ComboDto) {
    if (!confirm(`Excluir o combo "${c.name}"?`)) return;
    try { await del.mutateAsync(c.id); toast.success('Combo excluído'); }
    catch (err) { toast.error(err instanceof ApiError ? err.message : 'Erro'); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Catálogo</h1>
          <p className="text-muted-foreground">Serviços e combos da oficina.</p>
        </div>
        {canWrite && (
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="size-4" /> Novo combo
          </Button>
        )}
      </div>

      <CatalogTabs />

      <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        Combo é um agrupamento interno. Ao adicioná-lo na OS, ele expande nos
        serviços que o compõem — o combo não aparece para o cliente.
      </p>

      {isLoading ? (
        <div className="grid h-40 place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : combos.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Nenhum combo cadastrado.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {combos.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{c.name}</h3>
                    {c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}
                  </div>
                  {canWrite && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="size-4" /> Editar</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(c)}><Trash2 className="size-4" /> Excluir</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                <ul className="mt-3 space-y-1 text-sm">
                  {c.services.map((s) => (
                    <li key={s.serviceId} className="flex justify-between">
                      <span className="text-muted-foreground">{s.serviceName}</span>
                      <span>{formatCurrency(s.salePrice)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex justify-between border-t pt-2 text-sm font-semibold">
                  <span>Total</span>
                  <span>{formatCurrency(c.total)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ComboFormDialog open={open} onOpenChange={setOpen} combo={editing} />
    </div>
  );
}
