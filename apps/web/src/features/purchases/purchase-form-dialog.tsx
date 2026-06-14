'use client';

import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import { createPurchaseSchema } from '@oficina/shared';
import { apiErrorMessage, zodFieldErrors } from '@/lib/form-errors';
import { useParts } from '@/features/inventory/use-inventory';
import { useCreatePurchase, useSuppliers } from './use-purchases';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';

interface ItemRow { partId: string; partName: string; quantity: string; unitCost: string }

const FIELD_LABELS = {
  supplierId: 'Fornecedor',
  items: 'Itens',
  quantity: 'Quantidade',
  unitCost: 'Custo unitário',
};

export function PurchaseFormDialog({
  open, onOpenChange,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
}) {
  const [supplierId, setSupplierId] = useState('');
  const [items, setItems] = useState<ItemRow[]>([]);
  const [partToAdd, setPartToAdd] = useState('');
  const [error, setError] = useState('');

  const { data: suppliers } = useSuppliers({ page: 1, pageSize: 100 });
  const { data: parts } = useParts({ page: 1, pageSize: 100 });
  const create = useCreatePurchase();

  useEffect(() => {
    if (open) { setSupplierId(''); setItems([]); setPartToAdd(''); setError(''); }
  }, [open]);

  function addItem() {
    if (!partToAdd || items.some((i) => i.partId === partToAdd)) return;
    const part = parts?.data.find((p) => p.id === partToAdd);
    if (!part) return;
    setItems((rows) => [...rows, { partId: part.id, partName: part.name, quantity: '1', unitCost: String(part.costPrice) }]);
    setPartToAdd('');
  }

  const total = items.reduce((acc, i) => acc + (Number(i.quantity) || 0) * (Number(i.unitCost) || 0), 0);
  const available = (parts?.data ?? []).filter((p) => !items.some((i) => i.partId === p.id));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      supplierId: supplierId || undefined,
      items: items.map((i) => ({ partId: i.partId, quantity: i.quantity, unitCost: i.unitCost })),
    };
    const parsed = createPurchaseSchema.safeParse(payload);
    if (!parsed.success) { setError(Object.values(zodFieldErrors(parsed.error, FIELD_LABELS))[0] ?? 'Verifique os campos do formulário'); return; }
    try {
      const po = await create.mutateAsync(parsed.data);
      toast.success(`Pedido #${po.number} criado`);
      onOpenChange(false);
    } catch (err) { toast.error(apiErrorMessage(err, FIELD_LABELS, 'Erro ao criar')); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Novo pedido de compra</DialogTitle>
          <DialogDescription>Selecione o fornecedor e os itens.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Fornecedor</Label>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full">
              <option value="">— sem fornecedor —</option>
              {(suppliers?.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <Label required>Itens</Label>
            {items.length === 0 && <p className="text-xs text-muted-foreground">Nenhum item.</p>}
            {items.map((it, idx) => (
              <div key={it.partId} className="flex items-center gap-2">
                <span className="flex-1 truncate text-sm">{it.partName}</span>
                <Input type="number" step="any" value={it.quantity} aria-label="Quantidade"
                  onChange={(e) => setItems((r) => r.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))} className="w-20" />
                <Input type="number" step="0.01" value={it.unitCost} aria-label="Custo unitário"
                  onChange={(e) => setItems((r) => r.map((x, i) => i === idx ? { ...x, unitCost: e.target.value } : x))} className="w-24" />
                <button type="button" onClick={() => setItems((r) => r.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive">
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <Select value={partToAdd} onChange={(e) => setPartToAdd(e.target.value)} className="w-full flex-1">
                <option value="">Adicionar peça...</option>
                {available.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={addItem}><Plus className="size-4" /></Button>
            </div>
            {items.length > 0 && (
              <div className="flex justify-between border-t pt-2 text-sm font-medium">
                <span>Total</span><span>{formatCurrency(total)}</span>
              </div>
            )}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending || items.length === 0}>
              {create.isPending && <CarLoader className="size-4 animate-spin" />}
              Criar pedido
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
