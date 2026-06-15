'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  createFinancialEntrySchema,
  FinancialEntryType,
  FINANCIAL_ENTRY_TYPE_LABELS,
} from '@oficina/shared';
import { CarLoader } from '@/components/car-loader';
import { apiErrorMessage, zodFieldErrors } from '@/lib/form-errors';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateFinancialEntry } from './use-financial';

const FIELD_LABELS = {
  type: 'Tipo',
  description: 'Descrição',
  category: 'Categoria',
  dueDate: 'Vencimento',
  amount: 'Valor',
  notes: 'Observações',
};

function localIso(date: string): string {
  return new Date(`${date}T12:00:00`).toISOString();
}

export function FinancialFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const create = useCreateFinancialEntry();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<{
    type: FinancialEntryType;
    description: string;
    category: string;
    dueDate: string;
    amount: string;
    notes: string;
  }>({
    type: FinancialEntryType.RECEIVABLE,
    description: '',
    category: '',
    dueDate: new Date().toISOString().slice(0, 10),
    amount: '',
    notes: '',
  });

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm({
      type: FinancialEntryType.RECEIVABLE,
      description: '',
      category: '',
      dueDate: new Date().toISOString().slice(0, 10),
      amount: '',
      notes: '',
    });
  }, [open]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createFinancialEntrySchema.safeParse({
      ...form,
      dueDate: localIso(form.dueDate),
      amount: Number(form.amount),
    });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error, FIELD_LABELS));
      return;
    }
    try {
      await create.mutateAsync(parsed.data);
      toast.success('Lançamento criado');
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, FIELD_LABELS, 'Erro ao criar lançamento'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo lançamento financeiro</DialogTitle>
          <DialogDescription>Cadastre contas a receber, contas a pagar, despesas ou receitas manuais.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>Tipo</Label>
              <Select value={form.type} onChange={(e) => set('type', e.target.value as FinancialEntryType)}>
                {Object.values(FinancialEntryType).map((type) => <option key={type} value={type}>{FINANCIAL_ENTRY_TYPE_LABELS[type]}</option>)}
              </Select>
              {errors.type && <p className="text-xs text-destructive">{errors.type}</p>}
            </div>
            <div className="space-y-1.5">
              <Label required>Valor</Label>
              <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => set('amount', e.target.value)} />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label required>Descrição</Label>
            <Input value={form.description} onChange={(e) => set('description', e.target.value)} />
            {errors.description && <p className="text-xs text-destructive">{errors.description}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Input placeholder="Serviços, peças, aluguel..." value={form.category} onChange={(e) => set('category', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label required>Vencimento</Label>
              <Input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
              {errors.dueDate && <p className="text-xs text-destructive">{errors.dueDate}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending}>{create.isPending && <CarLoader className="size-4 animate-spin" />} Criar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
