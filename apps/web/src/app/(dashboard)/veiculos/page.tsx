'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Plus, MoreHorizontal, Search, Pencil, Trash2 } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import {
  FUEL_TYPES,
  FUEL_TYPE_LABELS,
  type FuelType,
  type VehicleDto,
} from '@oficina/shared';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useVehicles, useDeleteVehicle } from '@/features/vehicles/use-vehicles';
import { VehicleFormDialog } from '@/features/vehicles/vehicle-form-dialog';
import { useConfirm } from '@/components/ui/confirm-dialog';
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

function VehiclesContent() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('vehicles:write');
  const searchParams = useSearchParams();
  const customerId = searchParams.get('customerId') ?? undefined;

  const [search, setSearch] = useState('');
  const [fuel, setFuel] = useState('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VehicleDto | null>(null);

  const { data, isLoading } = useVehicles({
    page,
    pageSize: 10,
    search: search || undefined,
    fuel: (fuel || undefined) as FuelType | undefined,
    customerId,
  });
  const del = useDeleteVehicle();
  const confirm = useConfirm();

  const vehicles = data?.data ?? [];
  const meta = data?.meta;

  async function handleDelete(v: VehicleDto) {
    const ok = await confirm({
      title: 'Excluir veículo',
      description: `Excluir o veículo ${v.plate}? Esta ação não pode ser desfeita.`,
      destructive: true,
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await del.mutateAsync(v.id);
      toast.success('Veículo excluído');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao excluir');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Veículos</h1>
          <p className="text-muted-foreground">
            {customerId ? 'Veículos do cliente selecionado.' : 'Frota de todos os clientes.'}
          </p>
        </div>
        {canWrite && (
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="size-4" /> Novo veículo
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por placa, fabricante, modelo ou cliente..."
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          className="sm:w-48"
          value={fuel}
          onChange={(e) => {
            setFuel(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos combustíveis</option>
          {FUEL_TYPES.map((f) => (
            <option key={f} value={f}>
              {FUEL_TYPE_LABELS[f]}
            </option>
          ))}
        </Select>
      </div>

      {/* Desktop */}
      <div className="hidden rounded-xl border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Placa</TableHead>
              <TableHead>Veículo</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>KM</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <CarLoader className="mx-auto size-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : vehicles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  Nenhum veículo encontrado.
                </TableCell>
              </TableRow>
            ) : (
              vehicles.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>
                    <Badge variant="outline" className="font-mono">{v.plate}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    {v.manufacturer} {v.model}
                    <span className="text-muted-foreground">
                      {v.modelYear ? ` · ${v.modelYear}` : ''}
                      {v.fuel ? ` · ${FUEL_TYPE_LABELS[v.fuel as FuelType]}` : ''}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Link href={`/clientes/${v.customerId}?returnTo=${encodeURIComponent('/veiculos')}`} className="text-muted-foreground hover:underline">
                      {v.customerName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {v.currentKm != null ? v.currentKm.toLocaleString('pt-BR') : '—'}
                  </TableCell>
                  <TableCell>
                    {canWrite && (
                      <RowActions v={v} onEdit={(x) => { setEditing(x); setDialogOpen(true); }} onDelete={handleDelete} />
                    )}
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
        ) : vehicles.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhum veículo encontrado.</p>
        ) : (
          vehicles.map((v) => (
            <div key={v.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {v.manufacturer} {v.model}
                  </p>
                  <Link href={`/clientes/${v.customerId}?returnTo=${encodeURIComponent('/veiculos')}`} className="truncate text-sm text-muted-foreground hover:underline">
                    {v.customerName}
                  </Link>
                </div>
                {canWrite && (
                  <RowActions v={v} onEdit={(x) => { setEditing(x); setDialogOpen(true); }} onDelete={handleDelete} />
                )}
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="font-mono">{v.plate}</Badge>
                {v.modelYear && <span>{v.modelYear}</span>}
                {v.currentKm != null && <span>{v.currentKm.toLocaleString('pt-BR')} km</span>}
              </div>
            </div>
          ))
        )}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {meta.total} veículo(s) · página {meta.page} de {meta.totalPages}
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

      <VehicleFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        vehicle={editing}
        lockedCustomerId={!editing ? customerId : undefined}
      />
    </div>
  );
}

export default function VehiclesPage() {
  return (
    <Suspense fallback={<div className="grid h-64 place-items-center"><CarLoader className="size-6 animate-spin text-muted-foreground" /></div>}>
      <VehiclesContent />
    </Suspense>
  );
}

function RowActions({
  v,
  onEdit,
  onDelete,
}: {
  v: VehicleDto;
  onEdit: (v: VehicleDto) => void;
  onDelete: (v: VehicleDto) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Ações">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onEdit(v)}>
          <Pencil className="size-4" /> Editar
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDelete(v)}>
          <Trash2 className="size-4" /> Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
