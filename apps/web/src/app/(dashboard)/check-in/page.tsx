'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Camera, AlertTriangle } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import { FUEL_LEVEL_LABELS, type FuelLevel } from '@oficina/shared';
import { useAuth } from '@/lib/auth-context';
import { useCheckins } from '@/features/checkins/use-checkins';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CheckinsContent() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('checkins:write');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useCheckins({
    page,
    pageSize: 10,
    search: search || undefined,
  });

  const checkins = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Check-in</h1>
          <p className="text-muted-foreground">
            Registros de entrada dos veículos na oficina.
          </p>
        </div>
        {canWrite && (
          <Button asChild>
            <Link href={`/check-in/novo?returnTo=${encodeURIComponent('/check-in')}`}>
              <Plus className="size-4" /> Novo check-in
            </Link>
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por placa ou cliente..."
          className="pl-9"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {/* Desktop */}
      <div className="hidden rounded-xl border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Veículo</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>KM</TableHead>
              <TableHead>Combustível</TableHead>
              <TableHead>Registros</TableHead>
              <TableHead>OS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <CarLoader className="mx-auto size-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : checkins.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-muted-foreground"
                >
                  Nenhum check-in encontrado.
                </TableCell>
              </TableRow>
            ) : (
              checkins.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer"
                  onClick={() => {
                    window.location.href = `/check-in/${c.id}?returnTo=${encodeURIComponent('/check-in')}`;
                  }}
                >
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDate(c.createdAt)}
                  </TableCell>
                  <TableCell className="font-medium">
                    <Badge variant="outline" className="mr-2 font-mono">
                      {c.vehiclePlate}
                    </Badge>
                    {c.vehicleLabel}
                  </TableCell>
                  <TableCell>{c.customerName}</TableCell>
                  <TableCell>
                    {c.km != null ? c.km.toLocaleString('pt-BR') : '—'}
                  </TableCell>
                  <TableCell>
                    {c.fuelLevel
                      ? FUEL_LEVEL_LABELS[c.fuelLevel as FuelLevel]
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-3 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Camera className="size-3.5" /> {c.photos.length}
                      </span>
                      {c.damages.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-amber-600">
                          <AlertTriangle className="size-3.5" />{' '}
                          {c.damages.length}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {c.serviceOrderNumber ? (
                      <Badge variant="outline">
                        #{c.serviceOrderNumber}
                      </Badge>
                    ) : (
                      '—'
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
        ) : checkins.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            Nenhum check-in encontrado.
          </p>
        ) : (
          checkins.map((c) => (
            <Link
              key={c.id}
              href={`/check-in/${c.id}?returnTo=${encodeURIComponent('/check-in')}`}
              className="block rounded-xl border p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" className="font-mono">
                  {c.vehiclePlate}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDate(c.createdAt)}
                </span>
              </div>
              <p className="mt-1 font-medium">{c.vehicleLabel}</p>
              <p className="text-sm text-muted-foreground">{c.customerName}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                {c.km != null && <span>{c.km.toLocaleString('pt-BR')} km</span>}
                <span className="inline-flex items-center gap-1">
                  <Camera className="size-3.5" /> {c.photos.length}
                </span>
                {c.damages.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-600">
                    <AlertTriangle className="size-3.5" /> {c.damages.length}{' '}
                    avaria(s)
                  </span>
                )}
                {c.serviceOrderNumber && <span>OS #{c.serviceOrderNumber}</span>}
              </div>
            </Link>
          ))
        )}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {meta.page} de {meta.totalPages} · {meta.total} registros
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CheckinsPage() {
  return (
    <Suspense
      fallback={
        <div className="grid h-64 place-items-center">
          <CarLoader className="size-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <CheckinsContent />
    </Suspense>
  );
}
