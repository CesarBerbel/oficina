'use client';

import { useState } from 'react';
import { Plus, MoreHorizontal, Search, UserX, UserCheck, Pencil } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import { USER_ROLES, USER_ROLE_LABELS, type UserDto, type UserRole } from '@oficina/shared';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUsers, useSetUserActive } from '@/features/users/use-users';
import { UserFormDialog } from '@/features/users/user-form-dialog';
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

const roleVariant: Record<UserRole, 'default' | 'secondary' | 'warning'> = {
  ADMIN: 'default',
  ATENDENTE: 'secondary',
  TECNICO: 'secondary',
  ESTOQUISTA: 'warning',
};

export default function UsersPage() {
  const { user: me, hasPermission } = useAuth();
  const canWrite = hasPermission('users:write');

  const [search, setSearch] = useState('');
  const [role, setRole] = useState<string>('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UserDto | null>(null);

  const { data, isLoading, isError } = useUsers({
    page,
    pageSize: 10,
    search: search || undefined,
    role: (role || undefined) as UserRole | undefined,
  });
  const setActive = useSetUserActive();

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(u: UserDto) {
    setEditing(u);
    setDialogOpen(true);
  }

  async function toggleActive(u: UserDto) {
    try {
      await setActive.mutateAsync({ id: u.id, active: !u.active });
      toast.success(u.active ? 'Usuário inativado' : 'Usuário ativado');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao atualizar');
    }
  }

  const users = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usuários</h1>
          <p className="text-muted-foreground">Funcionários e perfis de acesso.</p>
        </div>
        {canWrite && (
          <Button onClick={openNew}>
            <Plus className="size-4" /> Novo usuário
          </Button>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou e-mail..."
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
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos os perfis</option>
          {USER_ROLES.map((r) => (
            <option key={r} value={r}>
              {USER_ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      </div>

      {isError && <p className="text-sm text-destructive">Erro ao carregar usuários.</p>}

      {/* Desktop: tabela */}
      <div className="hidden rounded-xl border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Senha</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <CarLoader className="mx-auto size-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  Nenhum usuário encontrado.
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.name}
                    {u.id === me?.id && (
                      <span className="ml-2 text-xs text-muted-foreground">(você)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant={roleVariant[u.role as UserRole]}>
                      {USER_ROLE_LABELS[u.role as UserRole]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {u.active ? (
                      <Badge variant="success">Ativo</Badge>
                    ) : (
                      <Badge variant="destructive">Inativo</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.forcePasswordChange ? (
                      <Badge variant="warning">Troca pendente</Badge>
                    ) : (
                      <Badge variant="secondary">Definida</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {canWrite && <RowActions u={u} onEdit={openEdit} onToggle={toggleActive} />}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: cards */}
      <div className="space-y-3 md:hidden">
        {isLoading ? (
          <div className="grid h-24 place-items-center">
            <CarLoader className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum usuário encontrado.
          </p>
        ) : (
          users.map((u) => (
            <div key={u.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{u.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                </div>
                {canWrite && <RowActions u={u} onEdit={openEdit} onToggle={toggleActive} />}
              </div>
              <div className="mt-3 flex gap-2">
                <Badge variant={roleVariant[u.role as UserRole]}>
                  {USER_ROLE_LABELS[u.role as UserRole]}
                </Badge>
                {u.active ? (
                  <Badge variant="success">Ativo</Badge>
                ) : (
                  <Badge variant="destructive">Inativo</Badge>
                )}
                {u.forcePasswordChange ? (
                  <Badge variant="warning">Troca pendente</Badge>
                ) : (
                  <Badge variant="secondary">Senha definida</Badge>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Paginação */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {meta.total} usuário(s) · página {meta.page} de {meta.totalPages}
          </span>
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

      <UserFormDialog open={dialogOpen} onOpenChange={setDialogOpen} user={editing} />
    </div>
  );
}

function RowActions({
  u,
  onEdit,
  onToggle,
}: {
  u: UserDto;
  onEdit: (u: UserDto) => void;
  onToggle: (u: UserDto) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Ações">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onEdit(u)}>
          <Pencil className="size-4" /> Editar
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onToggle(u)}>
          {u.active ? (
            <>
              <UserX className="size-4" /> Inativar
            </>
          ) : (
            <>
              <UserCheck className="size-4" /> Ativar
            </>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
