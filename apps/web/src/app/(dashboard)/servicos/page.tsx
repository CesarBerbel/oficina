'use client';

import { useState } from 'react';
import { Plus, Search, Loader2, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ServiceDto } from '@oficina/shared';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useServices, useDeleteService } from '@/features/catalog/use-catalog';
import { ServiceFormDialog } from '@/features/catalog/service-form-dialog';
import { CatalogTabs } from '@/features/catalog/catalog-tabs';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function ServicesPage() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('services:write');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceDto | null>(null);

  const { data, isLoading } = useServices({ page, pageSize: 10, search: search || undefined });
  const del = useDeleteService();
  const services = data?.data ?? [];
  const meta = data?.meta;

  async function handleDelete(s: ServiceDto) {
    if (!confirm(`Excluir o serviço "${s.name}"?`)) return;
    try { await del.mutateAsync(s.id); toast.success('Serviço excluído'); }
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
            <Plus className="size-4" /> Novo serviço
          </Button>
        )}
      </div>

      <CatalogTabs />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar serviço..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Serviço</TableHead>
              <TableHead>Peças padrão</TableHead>
              <TableHead className="text-right">Preço</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" /></TableCell></TableRow>
            ) : services.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Nenhum serviço.</TableCell></TableRow>
            ) : (
              services.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    {s.name}
                    {s.category && <span className="block text-xs text-muted-foreground">{s.category}</span>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {s.defaultParts.length === 0 ? '—' : s.defaultParts.map((p) => `${p.partName} (${p.quantity})`).join(', ')}
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(s.salePrice)}</TableCell>
                  <TableCell>{s.active ? <Badge variant="success">Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}</TableCell>
                  <TableCell>
                    {canWrite && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setEditing(s); setOpen(true); }}><Pencil className="size-4" /> Editar</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(s)}><Trash2 className="size-4" /> Excluir</DropdownMenuItem>
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
          <span className="text-muted-foreground">{meta.total} serviço(s)</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
          </div>
        </div>
      )}

      <ServiceFormDialog open={open} onOpenChange={setOpen} service={editing} />
    </div>
  );
}
