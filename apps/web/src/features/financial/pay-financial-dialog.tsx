'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  FinancialPaymentMethod,
  FINANCIAL_PAYMENT_METHOD_LABELS,
  payFinancialEntrySchema,
  type FinancialEntryDto,
} from '@oficina/shared';
import { CarLoader } from '@/components/car-loader';
import { apiErrorMessage, zodFieldErrors } from '@/lib/form-errors';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { usePayFinancialEntry } from './use-financial';

const FIELD_LABELS = { amount: 'Valor', method: 'Forma de pagamento', paidAt: 'Data', notes: 'Observações' };

export function PayFinancialDialog({ entry, open, onOpenChange }: { entry: FinancialEntryDto | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const pay = usePayFinancialEntry(entry?.id ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<{
    amount: string;
    method: FinancialPaymentMethod;
    paidAt: string;
    notes: string;
  }>({ amount: '', method: FinancialPaymentMethod.PIX, paidAt: new Date().toISOString().slice(0, 10), notes: '' });

  useEffect(() => {
    if (!open || !entry) return;
    setErrors({});
    setForm({ amount: String(entry.remainingAmount), method: FinancialPaymentMethod.PIX, paidAt: new Date().toISOString().slice(0, 10), notes: '' });
  }, [open, entry]);

  if (!entry) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = payFinancialEntrySchema.safeParse({ ...form, amount: Number(form.amount), paidAt: new Date(`${form.paidAt}T12:00:00`).toISOString() });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error, FIELD_LABELS));
      return;
    }
    try {
      await pay.mutateAsync(parsed.data);
      toast.success('Baixa registrada');
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, FIELD_LABELS, 'Erro ao registrar baixa'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar baixa</DialogTitle>
          <DialogDescription>{entry.description} · saldo {formatCurrency(entry.remainingAmount)}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>Valor</Label>
              <Input type="number" step="0.01" min="0" max={entry.remainingAmount} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
            </div>
            <div className="space-y-1.5">
              <Label required>Forma</Label>
              <Select value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value as FinancialPaymentMethod }))}>
                {Object.values(FinancialPaymentMethod).map((method) => <option key={method} value={method}>{FINANCIAL_PAYMENT_METHOD_LABELS[method]}</option>)}
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label required>Data</Label>
            <Input type="date" value={form.paidAt} onChange={(e) => setForm((f) => ({ ...f, paidAt: e.target.value }))} />
            {errors.paidAt && <p className="text-xs text-destructive">{errors.paidAt}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={pay.isPending}>{pay.isPending && <CarLoader className="size-4 animate-spin" />} Registrar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
