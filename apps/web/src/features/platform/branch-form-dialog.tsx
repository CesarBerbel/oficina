'use client';

import { useEffect, useState } from 'react';
import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import { createBranchSchema } from '@oficina/shared';
import { apiErrorMessage, zodFieldErrors } from '@/lib/form-errors';
import { maskCnpj } from '@/lib/masks';
import { slugify } from '@/lib/slugify';
import { useCreateBranch } from './use-platform';
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

const FIELD_LABELS = {
  shopName: 'Nome da filial',
  slug: 'Identificador',
  cnpj: 'CNPJ',
  adminName: 'Administrador',
  adminEmail: 'E-mail',
  password: 'Senha',
};

const empty = {
  shopName: '',
  slug: '',
  cnpj: '',
  adminName: '',
  adminEmail: '',
  password: '',
};

export function BranchFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [form, setForm] = useState(empty);
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateBranch();

  useEffect(() => {
    if (open) {
      setForm(empty);
      setSlugTouched(false);
      setErrors({});
    }
  }, [open]);

  function set<K extends keyof typeof empty>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createBranchSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error, FIELD_LABELS));
      return;
    }
    setErrors({});
    try {
      await create.mutateAsync(parsed.data);
      toast.success('Filial criada');
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, FIELD_LABELS, 'Erro ao criar filial'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova filial</DialogTitle>
          <DialogDescription>
            A filial fica vinculada à matriz e tem seu próprio administrador.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome da filial" error={errors.shopName} required>
              <Input
                value={form.shopName}
                onChange={(e) => {
                  const value = e.target.value;
                  setForm((f) => ({
                    ...f,
                    shopName: value,
                    slug: slugTouched ? f.slug : slugify(value),
                  }));
                }}
                placeholder="Filial Centro"
              />
            </Field>
            <Field label="Identificador (acesso)" error={errors.slug} required>
              <Input
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set('slug', slugify(e.target.value));
                }}
                placeholder="filial-centro"
              />
            </Field>
          </div>

          <Field label="CNPJ" error={errors.cnpj}>
            <Input
              value={form.cnpj}
              onChange={(e) => set('cnpj', maskCnpj(e.target.value))}
              inputMode="numeric"
              maxLength={18}
              placeholder="00.000.000/0000-00"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Administrador" error={errors.adminName} required>
              <Input value={form.adminName} onChange={(e) => set('adminName', e.target.value)} />
            </Field>
            <Field label="E-mail" error={errors.adminEmail} required>
              <Input
                type="email"
                value={form.adminEmail}
                onChange={(e) => set('adminEmail', e.target.value)}
                placeholder="admin@filial.com"
              />
            </Field>
            <Field label="Senha" error={errors.password} required>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                placeholder="Mínimo de 8 caracteres"
              />
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <CarLoader className="size-4 animate-spin" />}
              Criar filial
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label required={required}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
