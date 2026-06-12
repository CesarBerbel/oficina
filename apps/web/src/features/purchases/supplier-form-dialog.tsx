'use client';

import { useEffect, useState } from 'react';

import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import { createSupplierSchema, updateSupplierSchema, type SupplierDto } from '@oficina/shared';
import { apiErrorMessage, zodFieldErrors } from '@/lib/form-errors';
import { useCreateSupplier, useUpdateSupplier } from './use-purchases';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { maskCpfCnpj, maskPhone } from '@/lib/masks';

const FIELD_LABELS = {
  name: 'Nome',
  document: 'CPF/CNPJ',
  phone: 'Telefone',
  email: 'E-mail',
};

export function SupplierFormDialog({
  open, onOpenChange, supplier,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; supplier?: SupplierDto | null;
}) {
  const isEdit = !!supplier;
  const [form, setForm] = useState({ name: '', document: '', phone: '', email: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateSupplier();
  const update = useUpdateSupplier(supplier?.id ?? '');
  const pending = create.isPending || update.isPending;

  useEffect(() => {
    if (!open) return;
    setForm({
      name: supplier?.name ?? '',
      document: maskCpfCnpj(supplier?.document),
      phone: maskPhone(supplier?.phone),
      email: supplier?.email ?? '',
    });
    setErrors({});
  }, [open, supplier]);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const schema = isEdit ? updateSupplierSchema : createSupplierSchema;
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error, FIELD_LABELS));
      return;
    }
    try {
      if (isEdit) { await update.mutateAsync(parsed.data); toast.success('Fornecedor atualizado'); }
      else { await create.mutateAsync(parsed.data as never); toast.success('Fornecedor criado'); }
      onOpenChange(false);
    } catch (err) { toast.error(apiErrorMessage(err, FIELD_LABELS)); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar fornecedor' : 'Novo fornecedor'}</DialogTitle>
          <DialogDescription>Dados do fornecedor.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label required>Nome</Label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>CPF/CNPJ (opcional)</Label>
              <Input
                inputMode="numeric"
                maxLength={18}
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                value={form.document}
                onChange={(e) => set('document', maskCpfCnpj(e.target.value))}
              />
              {errors.document && <p className="text-xs text-destructive">{errors.document}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input
                inputMode="tel"
                maxLength={15}
                placeholder="(00) 00000-0000"
                value={form.phone}
                onChange={(e) => set('phone', maskPhone(e.target.value))}
              />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>E-mail</Label>
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={pending}>
              {pending && <CarLoader className="size-4 animate-spin" />}
              {isEdit ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
