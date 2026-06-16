'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Plus, MoreHorizontal, Search, Pencil, Trash2, Eye, Car } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import {
  CUSTOMER_TYPE_LABELS,
  CustomerType,
  type CustomerDto,
} from '@oficina/shared';
import { ApiError } from '@/lib/api';
import { maskCpfCnpj, maskPhone } from '@/lib/masks';
import { useAuth } from '@/lib/auth-context';
import { useCustomers, useDeleteCustomer } from '@/features/customers/use-customers';
import { CustomerFormDialog } from '@/features/customers/customer-form-dialog';
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

export default function CustomersPage() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('customers:write');

  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerDto | null>(null);

  const { data, isLoading } = useCustomers({
    page,
    pageSize: 10,
    search: search || undefined,
    type: (type || undefined) as CustomerType | undefined,
  });
  const del = useDeleteCustomer();
  const confirm = useConfirm();

  const customers = data?.data ?? [];
  const meta = data?.meta;

  async function handleDelete(c: CustomerDto) {
    const ok = await confirm({
      title: 'Excluir cliente',
      description: `Excluir o cliente "${c.name}"? Esta ação não pode ser desfeita.`,
      destructive: true,
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await del.mutateAsync(c.id);
      toast.success('Cliente excluído');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao excluir');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">Pessoas físicas e jurídicas.</p>
        </div>
        {canWrite && (
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="size-4" /> Novo cliente
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, documento, e-mail ou telefone..."
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
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos os tipos</option>
          {Object.entries(CUSTOMER_TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </div>

      {/* Desktop */}
      <div className="hidden rounded-xl border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Veículos</TableHead>
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
            ) : customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  Nenhum cliente encontrado.
                </TableCell>
              </TableRow>
            ) : (
              customers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/clientes/${c.id}?returnTo=${encodeURIComponent('/clientes')}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                    <div className="mt-0.5">
                      <Badge variant="secondary">{CUSTOMER_TYPE_LABELS[c.type]}</Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.document ? maskCpfCnpj(c.document) : '—'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.phone ? maskPhone(c.phone) : c.whatsapp ? maskPhone(c.whatsapp) : c.email ?? '—'}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Car className="size-4" /> {c.vehiclesCount}
                    </span>
                  </TableCell>
                  <TableCell>
                    <RowActions c={c} canWrite={canWrite} onEdit={(x) => { setEditing(x); setDialogOpen(true); }} onDelete={handleDelete} />
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
        ) : customers.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
        ) : (
          customers.map((c) => (
            <div key={c.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/clientes/${c.id}?returnTo=${encodeURIComponent('/clientes')}`} className="block truncate font-medium hover:underline">
                    {c.name}
                  </Link>
                  <p className="truncate text-sm text-muted-foreground">
                    {c.document ? maskCpfCnpj(c.document) : c.phone ? maskPhone(c.phone) : c.email ?? '—'}
                  </p>
                </div>
                <RowActions c={c} canWrite={canWrite} onEdit={(x) => { setEditing(x); setDialogOpen(true); }} onDelete={handleDelete} />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="secondary">{CUSTOMER_TYPE_LABELS[c.type]}</Badge>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Car className="size-3.5" /> {c.vehiclesCount} veículo(s)
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {meta.total} cliente(s) · página {meta.page} de {meta.totalPages}
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

      <CustomerFormDialog open={dialogOpen} onOpenChange={setDialogOpen} customer={editing} />
    </div>
  );
}

function RowActions({
  c,
  canWrite,
  onEdit,
  onDelete,
}: {
  c: CustomerDto;
  canWrite: boolean;
  onEdit: (c: CustomerDto) => void;
  onDelete: (c: CustomerDto) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Ações">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/clientes/${c.id}?returnTo=${encodeURIComponent('/clientes')}`}>
            <Eye className="size-4" /> Ver detalhes
          </Link>
        </DropdownMenuItem>
        {canWrite && (
          <>
            <DropdownMenuItem onClick={() => onEdit(c)}>
              <Pencil className="size-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete(c)}>
              <Trash2 className="size-4" /> Excluir
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
