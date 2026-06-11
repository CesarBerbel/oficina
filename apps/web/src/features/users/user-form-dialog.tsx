'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  createUserSchema,
  updateUserSchema,
  USER_ROLES,
  USER_ROLE_LABELS,
  type UserDto,
  type UserRole,
} from '@oficina/shared';
import { apiErrorMessage, zodFieldErrors } from '@/lib/form-errors';
import { useCreateUser, useUpdateUser } from './use-users';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quando presente, é edição; ausente, criação. */
  user?: UserDto | null;
}

const FIELD_LABELS = {
  name: 'Nome',
  email: 'E-mail',
  password: 'Senha',
  role: 'Perfil',
};

export function UserFormDialog({ open, onOpenChange, user }: Props) {
  const isEdit = !!user;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('ATENDENTE');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const create = useCreateUser();
  const update = useUpdateUser(user?.id ?? '');
  const pending = create.isPending || update.isPending;

  useEffect(() => {
    if (open) {
      setName(user?.name ?? '');
      setEmail(user?.email ?? '');
      setRole((user?.role as UserRole) ?? 'ATENDENTE');
      setPassword('');
      setErrors({});
    }
  }, [open, user]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const schema = isEdit ? updateUserSchema : createUserSchema;
    const payload = isEdit
      ? { name, email, role, ...(password ? { password } : {}) }
      : { name, email, role, password };

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error, FIELD_LABELS));
      return;
    }
    setErrors({});

    try {
      if (isEdit) {
        await update.mutateAsync(parsed.data);
        toast.success('Usuário atualizado');
      } else {
        await create.mutateAsync(parsed.data as never);
        toast.success('Usuário criado');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, FIELD_LABELS));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Editar usuário' : 'Novo usuário'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Atualize os dados do funcionário.'
              : 'Cadastre um novo funcionário e seu perfil de acesso.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="u-name" required>Nome</Label>
            <Input
              id="u-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="u-email" required>E-mail</Label>
            <Input
              id="u-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="u-password" required={!isEdit}>
              Senha {isEdit && <span className="text-muted-foreground">(deixe em branco para manter)</span>}
            </Label>
            <Input
              id="u-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="u-role" required>Perfil</Label>
            <Select
              id="u-role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
            >
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {USER_ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
