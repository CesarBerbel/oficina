'use client';

import { useState } from 'react';
import {
  Plus, Loader2, MoreHorizontal, PackageCheck, Send, XCircle, Sparkles, Pencil, Package2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  PURCHASE_ORDER_STATUS_LABELS,
  PurchaseOrderStatus,
  type PurchaseOrderSummaryDto,
  type SupplierDto,
} from '@oficina/shared';
import { ApiError } from '@/lib/api';
import { maskCpfCnpj, maskPhone } from '@/lib/masks';
import { useAuth } from '@/lib/auth-context';
import {
  usePurchases, usePurchase, useCreateFromShortages, useSetPurchaseStatus, useSuppliers,
} from '@/features/purchases/use-purchases';
import { PurchaseFormDialog } from '@/features/purchases/purchase-form-dialog';
import { PurchaseReceiveDialog } from '@/features/purchases/purchase-receive-dialog';
import { PurchaseItemsDialog } from '@/features/purchases/purchase-items-dialog';
import { SupplierFormDialog } from '@/features/purchases/supplier-form-dialog';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const STATUS_VARIANT: Record<PurchaseOrderStatus, BadgeProps['variant']> = {
  ABERTO: 'secondary',
  ENVIADO: 'default',
  PARCIALMENTE_RECEBIDO: 'warning',
  RECEBIDO: 'success',
  CANCELADO: 'destructive',
};

export default function PurchasesPage() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('purchases:write');
  const [tab, setTab] = useState<'pedidos' | 'fornecedores'>('pedidos');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Compras</h1>
        <p className="text-muted-foreground">Pedidos de compra e fornecedores.</p>
      </div>

      <div className="flex gap-1 border-b">
        {(['pedidos', 'fornecedores'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize transition-colors',
              tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'pedidos' ? <PedidosTab canWrite={canWrite} /> : <FornecedoresTab canWrite={canWrite} />}
    </div>
  );
}

function PedidosTab({ canWrite }: { canWrite: boolean }) {
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [receiveId, setReceiveId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);

  const { data, isLoading } = usePurchases({ page, pageSize: 10 });
  const { data: receivePurchase } = usePurchase(receiveId ?? undefined);
  const { data: viewPurchase, isLoading: viewLoading } = usePurchase(viewId ?? undefined);
  const fromShortages = useCreateFromShortages();

  const orders = data?.data ?? [];
  const meta = data?.meta;

  async function generateShortages() {
    try {
      const { created } = await fromShortages.mutateAsync();
      toast.success(
        `${created} pedido(s) gerado(s) — agrupados por fornecedor`,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro');
    }
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setFormOpen(true)}><Plus className="size-4" /> Novo pedido</Button>
          <Button variant="outline" onClick={generateShortages} disabled={fromShortages.isPending}>
            {fromShortages.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Gerar de peças em falta
          </Button>
        </div>
      )}

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pedido</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Itens</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="h-24 text-center"><Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" /></TableCell></TableRow>
            ) : orders.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Nenhum pedido.</TableCell></TableRow>
            ) : (
              orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-semibold">
                    #{o.number}
                    <span className="block text-xs font-normal text-muted-foreground">{formatDate(o.createdAt)}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {o.supplierName ?? '—'}
                    {o.serviceOrderNumber != null && (
                      <span className="block text-xs text-amber-600 dark:text-amber-400">
                        gerado pela OS #{o.serviceOrderNumber}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{o.itemsCount}</TableCell>
                  <TableCell><Badge variant={STATUS_VARIANT[o.status]}>{PURCHASE_ORDER_STATUS_LABELS[o.status]}</Badge></TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(o.total)}</TableCell>
                  <TableCell>
                    <RowActions
                      o={o}
                      canWrite={canWrite}
                      onReceive={() => setReceiveId(o.id)}
                      onView={() => setViewId(o.id)}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{meta.total} pedido(s)</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
          </div>
        </div>
      )}

      <PurchaseFormDialog open={formOpen} onOpenChange={setFormOpen} />
      <PurchaseReceiveDialog
        open={!!receiveId}
        onOpenChange={(o) => !o && setReceiveId(null)}
        purchase={receivePurchase ?? null}
      />
      <PurchaseItemsDialog
        open={!!viewId}
        onOpenChange={(o) => !o && setViewId(null)}
        purchase={viewPurchase ?? null}
        loading={viewLoading}
      />
    </div>
  );
}

function RowActions({ o, canWrite, onReceive, onView }: {
  o: PurchaseOrderSummaryDto; canWrite: boolean; onReceive: () => void; onView: () => void;
}) {
  const setStatus = useSetPurchaseStatus(o.id);
  const finalized = o.status === 'RECEBIDO' || o.status === 'CANCELADO';
  async function change(status: 'ENVIADO' | 'CANCELADO') {
    try { await setStatus.mutateAsync(status); toast.success('Status atualizado'); }
    catch (err) { toast.error(err instanceof ApiError ? err.message : 'Erro'); }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onView}><Package2 className="size-4" /> Ver produtos</DropdownMenuItem>
        {canWrite && !finalized && <DropdownMenuItem onClick={onReceive}><PackageCheck className="size-4" /> Receber</DropdownMenuItem>}
        {canWrite && o.status === 'ABERTO' && <DropdownMenuItem onClick={() => change('ENVIADO')}><Send className="size-4" /> Marcar enviado</DropdownMenuItem>}
        {canWrite && !finalized && <DropdownMenuItem onClick={() => change('CANCELADO')}><XCircle className="size-4" /> Cancelar</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FornecedoresTab({ canWrite }: { canWrite: boolean }) {
  const { data, isLoading } = useSuppliers({ page: 1, pageSize: 50 });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierDto | null>(null);
  const suppliers = data?.data ?? [];

  return (
    <div className="space-y-4">
      {canWrite && <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="size-4" /> Novo fornecedor</Button>}
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>CNPJ/CPF</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="h-24 text-center"><Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" /></TableCell></TableRow>
            ) : suppliers.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">Nenhum fornecedor.</TableCell></TableRow>
            ) : (
              suppliers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground">{s.document ? maskCpfCnpj(s.document) : '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{s.phone ? maskPhone(s.phone) : s.email ?? '—'}</TableCell>
                  <TableCell>
                    {canWrite && (
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(s); setOpen(true); }}>
                        <Pencil className="size-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <SupplierFormDialog open={open} onOpenChange={setOpen} supplier={editing} />
    </div>
  );
}
