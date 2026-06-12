'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, AlertTriangle } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import {
  SERVICE_ORDER_STATUSES,
  SERVICE_ORDER_STATUS_LABELS,
  type ServiceOrderStatus,
} from '@oficina/shared';
import { useAuth } from '@/lib/auth-context';
import { useServiceOrders } from '@/features/service-orders/use-service-orders';
import { NewOsDialog } from '@/features/service-orders/new-os-dialog';
import { StatusBadge } from '@/features/service-orders/status-badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function ServiceOrdersPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('os:write');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading } = useServiceOrders({
    page,
    pageSize: 10,
    search: search || undefined,
    status: (status || undefined) as ServiceOrderStatus | undefined,
  });

  const orders = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ordens de Serviço</h1>
          <p className="text-muted-foreground">Acompanhe e gerencie as OS.</p>
        </div>
        {canWrite && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> Nova OS
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por número, cliente ou placa..."
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          className="sm:w-56"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos os status</option>
          {SERVICE_ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {SERVICE_ORDER_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </div>

      {/* Desktop */}
      <div className="hidden rounded-xl border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>OS</TableHead>
              <TableHead>Cliente / Veículo</TableHead>
              <TableHead>Técnico</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <CarLoader className="mx-auto size-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  Nenhuma OS encontrada.
                </TableCell>
              </TableRow>
            ) : (
              orders.map((o) => (
                <TableRow
                  key={o.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/os/${o.id}?returnTo=${encodeURIComponent('/os')}`)}
                >
                  <TableCell>
                    <span className="font-semibold">#{o.number}</span>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      {formatDate(o.openedAt)}
                      {o.isOverdue && (
                        <span className="inline-flex items-center gap-0.5 text-destructive">
                          <AlertTriangle className="size-3" /> atrasada
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link href={`/os/${o.id}?returnTo=${encodeURIComponent('/os')}`} className="block font-medium hover:underline">
                      {o.customerName}
                    </Link>
                    <span className="text-sm text-muted-foreground">
                      {o.vehicleLabel} · {o.vehiclePlate}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {o.technicianName ?? '—'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={o.status} />
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(o.total)}
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
          <div className="grid h-24 place-items-center">
            <CarLoader className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : orders.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma OS encontrada.</p>
        ) : (
          orders.map((o) => (
            <Link
              key={o.id}
              href={`/os/${o.id}?returnTo=${encodeURIComponent('/os')}`}
              className="block rounded-xl border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">
                    #{o.number}
                    {o.isOverdue && (
                      <AlertTriangle className="ml-1 inline size-3.5 text-destructive" />
                    )}
                  </p>
                  <p className="truncate font-medium">{o.customerName}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {o.vehicleLabel} · {o.vehiclePlate}
                  </p>
                </div>
                <StatusBadge status={o.status} />
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{o.technicianName ?? 'Sem técnico'}</span>
                <span className="font-medium">{formatCurrency(o.total)}</span>
              </div>
            </Link>
          ))
        )}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {meta.total} OS · página {meta.page} de {meta.totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>
              Próxima
            </Button>
          </div>
        </div>
      )}

      <NewOsDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
