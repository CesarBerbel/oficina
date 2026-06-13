'use client';

import { useState } from 'react';
import { Plus, Search, MoreHorizontal, Pencil, ArrowLeftRight, AlertTriangle } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import {
  PART_TYPE_LABELS,
  PART_TYPES,
  type PartDto,
  type PartType,
} from '@oficina/shared';
import { useAuth } from '@/lib/auth-context';
import { useParts } from '@/features/inventory/use-inventory';
import { PartFormDialog } from '@/features/inventory/part-form-dialog';
import { StockMovementDialog } from '@/features/inventory/stock-movement-dialog';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function InventoryPage() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('inventory:write');
  const canMove = hasPermission('stock:move');

  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PartDto | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moving, setMoving] = useState<PartDto | null>(null);

  const { data, isLoading } = useParts({
    page,
    pageSize: 10,
    search: search || undefined,
    type: (type || undefined) as PartType | undefined,
    lowStock: lowStock || undefined,
  });

  const parts = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Estoque</h1>
          <p className="text-muted-foreground">Peças e insumos.</p>
        </div>
        {canWrite && (
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="size-4" /> Nova peça
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, código da peça, NCM, barras ou marca..."
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select className="sm:w-40" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
          <option value="">Todos os tipos</option>
          {PART_TYPES.map((t) => <option key={t} value={t}>{PART_TYPE_LABELS[t]}</option>)}
        </Select>
        <Button
          variant={lowStock ? 'default' : 'outline'}
          onClick={() => { setLowStock((v) => !v); setPage(1); }}
        >
          <AlertTriangle className="size-4" /> Estoque baixo
        </Button>
      </div>

      {/* Desktop */}
      <div className="hidden rounded-xl border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>NCM</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Estoque</TableHead>
              <TableHead className="text-right">Venda</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="h-24 text-center"><CarLoader className="mx-auto size-5 animate-spin text-muted-foreground" /></TableCell></TableRow>
            ) : parts.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Nenhuma peça encontrada.</TableCell></TableRow>
            ) : (
              parts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.name}
                    {p.brand && <span className="block text-xs text-muted-foreground">{p.brand}</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.sku ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{p.ncm ?? '—'}</TableCell>
                  <TableCell><Badge variant="secondary">{PART_TYPE_LABELS[p.type]}</Badge></TableCell>
                  <TableCell className="text-right">
                    <span className={p.lowStock ? 'font-semibold text-destructive' : ''}>
                      {p.currentStock} {p.unit}
                    </span>
                    {p.lowStock && <AlertTriangle className="ml-1 inline size-3.5 text-destructive" />}
                    {p.reservedStock > 0 && (
                      <span className="block text-xs text-amber-600 dark:text-amber-400">
                        {p.reservedStock} reservado · {p.availableStock} livre
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(p.salePrice)}</TableCell>
                  <TableCell>
                    <RowActions
                      p={p} canWrite={canWrite} canMove={canMove}
                      onEdit={(x) => { setEditing(x); setFormOpen(true); }}
                      onMove={(x) => { setMoving(x); setMoveOpen(true); }}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile */}
      <div className="space-y-3 md:hidden">
        {isLoading ? (
          <div className="grid h-24 place-items-center"><CarLoader className="size-5 animate-spin text-muted-foreground" /></div>
        ) : parts.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma peça encontrada.</p>
        ) : (
          parts.map((p) => (
            <div key={p.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="text-sm text-muted-foreground">{p.sku ?? p.brand ?? '—'}</p>
                  {p.ncm && <p className="text-xs text-muted-foreground">NCM {p.ncm}</p>}
                </div>
                <RowActions
                  p={p} canWrite={canWrite} canMove={canMove}
                  onEdit={(x) => { setEditing(x); setFormOpen(true); }}
                  onMove={(x) => { setMoving(x); setMoveOpen(true); }}
                />
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className={p.lowStock ? 'font-semibold text-destructive' : ''}>
                  {p.currentStock} {p.unit}
                </span>
                <span className="font-medium">{formatCurrency(p.salePrice)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{meta.total} item(s) · página {meta.page} de {meta.totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
          </div>
        </div>
      )}

      <PartFormDialog open={formOpen} onOpenChange={setFormOpen} part={editing} />
      <StockMovementDialog open={moveOpen} onOpenChange={setMoveOpen} part={moving} />
    </div>
  );
}

function RowActions({ p, canWrite, canMove, onEdit, onMove }: {
  p: PartDto; canWrite: boolean; canMove: boolean;
  onEdit: (p: PartDto) => void; onMove: (p: PartDto) => void;
}) {
  if (!canWrite && !canMove) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Ações"><MoreHorizontal className="size-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canMove && (
          <DropdownMenuItem onClick={() => onMove(p)}>
            <ArrowLeftRight className="size-4" /> Movimentar
          </DropdownMenuItem>
        )}
        {canWrite && (
          <DropdownMenuItem onClick={() => onEdit(p)}>
            <Pencil className="size-4" /> Editar
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
