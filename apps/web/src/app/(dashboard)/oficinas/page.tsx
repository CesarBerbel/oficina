'use client';

import { useState } from 'react';
import { Plus, Power, Trash2, Building2 } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import type { PlatformTenantDto } from '@oficina/shared';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatDate } from '@/lib/utils';
import {
  usePlatformTenants,
  useSetTenantActive,
  useDeleteTenant,
} from '@/features/platform/use-platform';
import { BranchFormDialog } from '@/features/platform/branch-form-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function OficinasPage() {
  const { user } = useAuth();
  const [branchOpen, setBranchOpen] = useState(false);
  const { data: tenants, isLoading } = usePlatformTenants();
  const setActive = useSetTenantActive();
  const del = useDeleteTenant();
  const confirm = useConfirm();

  if (!user?.platformAdmin) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <Building2 className="mx-auto mb-3 size-8 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Acesso restrito</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Esta área é exclusiva do administrador da plataforma.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid h-64 place-items-center">
        <CarLoader className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const rows = tenants ?? [];

  async function toggle(t: PlatformTenantDto) {
    const ok = await confirm({
      title: t.active ? 'Desativar oficina' : 'Ativar oficina',
      description: t.active
        ? `Desativar "${t.name}"? Os usuários dela não conseguirão acessar.`
        : `Reativar "${t.name}"?`,
      destructive: t.active,
      confirmLabel: t.active ? 'Desativar' : 'Ativar',
    });
    if (!ok) return;
    try {
      await setActive.mutateAsync({ id: t.id, active: !t.active });
      toast.success(t.active ? 'Oficina desativada' : 'Oficina ativada');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao atualizar');
    }
  }

  async function remove(t: PlatformTenantDto) {
    const ok = await confirm({
      title: 'Excluir oficina',
      description: `Excluir "${t.name}" e TODOS os seus dados (clientes, OS, estoque...)? Esta ação não pode ser desfeita.`,
      destructive: true,
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await del.mutateAsync(t.id);
      toast.success('Oficina excluída');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao excluir');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Building2 className="size-6 text-primary" /> Oficinas
          </h1>
          <p className="text-muted-foreground">Matriz e filiais cadastradas na plataforma.</p>
        </div>
        <Button onClick={() => setBranchOpen(true)}>
          <Plus className="size-4" /> Nova filial
        </Button>
      </div>

      <BranchFormDialog open={branchOpen} onOpenChange={setBranchOpen} />

      {/* Desktop */}
      <div className="hidden rounded-xl border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Oficina</TableHead>
              <TableHead>Identificador</TableHead>
              <TableHead className="text-right">Usuários</TableHead>
              <TableHead className="text-right">OS</TableHead>
              <TableHead>Criada em</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Nenhuma oficina.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((t) => {
                const isSelf = t.id === user?.tenantId;
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      <span className={t.isMatriz ? '' : 'pl-4'}>{t.name}</span>
                      <Badge
                        variant={t.isMatriz ? 'default' : 'outline'}
                        className="ml-2 align-middle text-[10px]"
                      >
                        {t.isMatriz ? 'Matriz' : 'Filial'}
                      </Badge>
                      {isSelf && (
                        <span className="ml-2 text-xs text-muted-foreground">(sua oficina)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{t.slug}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.usersCount}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.serviceOrdersCount}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(t.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.active ? 'success' : 'secondary'}>
                        {t.active ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => toggle(t)}>
                          <Power className="size-4" />
                          {t.active ? 'Desativar' : 'Ativar'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(t)}
                          disabled={isSelf}
                          title={isSelf ? 'Não é possível excluir a própria oficina' : 'Excluir'}
                          className="text-muted-foreground hover:text-destructive disabled:opacity-40"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile */}
      <div className="space-y-3 md:hidden">
        {rows.length === 0 && (
          <p className="rounded-xl border bg-card p-4 text-center text-sm text-muted-foreground">
            Nenhuma oficina.
          </p>
        )}
        {rows.map((t) => {
          const isSelf = t.id === user?.tenantId;
          return (
            <div key={t.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    {t.name}
                    <Badge variant={t.isMatriz ? 'default' : 'outline'} className="text-[10px]">
                      {t.isMatriz ? 'Matriz' : 'Filial'}
                    </Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">{t.slug}</p>
                </div>
                <Badge variant={t.active ? 'success' : 'secondary'}>
                  {t.active ? 'Ativa' : 'Inativa'}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t.usersCount} usuário(s) · {t.serviceOrdersCount} OS · {formatDate(t.createdAt)}
                {isSelf && ' · sua oficina'}
              </p>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => toggle(t)}>
                  <Power className="size-4" /> {t.active ? 'Desativar' : 'Ativar'}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => remove(t)}
                  disabled={isSelf}
                  className="text-muted-foreground hover:text-destructive disabled:opacity-40"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
