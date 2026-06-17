'use client';

import { useState } from 'react';

import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import {
  stockMovementSchema,
  STOCK_MOVEMENT_LABELS,
  type PartDto,
  type StockMovementType,
} from '@oficina/shared';
import { apiErrorMessage, zodFieldErrors } from '@/lib/form-errors';
import { usePartMovements, useStockMove } from './use-inventory';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

const MANUAL_TYPES: StockMovementType[] = ['ENTRADA', 'SAIDA', 'AJUSTE'];

const FIELD_LABELS = {
  type: 'Tipo',
  quantity: 'Quantidade/Novo saldo',
  note: 'Observação',
};

export function StockMovementDialog({
  open,
  onOpenChange,
  part,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  part: PartDto | null;
}) {
  const [type, setType] = useState<string>('ENTRADA');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');

  const move = useStockMove(part?.id ?? '');
  const { data: movements } = usePartMovements(open ? part?.id : undefined);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = stockMovementSchema.safeParse({ type, quantity, note });
    if (!parsed.success) {
      toast.error(
        Object.values(zodFieldErrors(parsed.error, FIELD_LABELS))[0] ??
          'Verifique os campos do formulário',
      );
      return;
    }
    try {
      await move.mutateAsync(parsed.data);
      toast.success('Movimentação registrada');
      setQuantity('');
      setNote('');
    } catch (err) {
      toast.error(apiErrorMessage(err, FIELD_LABELS, 'Erro ao movimentar'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Movimentar estoque</DialogTitle>
          <DialogDescription>
            {part?.name} · saldo atual:{' '}
            <strong>
              {part?.currentStock} {part?.unit}
            </strong>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label required>Tipo</Label>
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {MANUAL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {STOCK_MOVEMENT_LABELS[t]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label required>{type === 'AJUSTE' ? 'Novo saldo' : 'Quantidade'}</Label>
            <Input
              type="number"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Observação</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Button type="submit" className="w-full" disabled={move.isPending}>
              {move.isPending && <CarLoader className="size-4 animate-spin" />}
              Registrar
            </Button>
          </div>
        </form>

        <div>
          <h4 className="mb-2 text-sm font-semibold">Histórico</h4>
          <div className="max-h-56 space-y-1 overflow-y-auto text-sm">
            {(movements ?? []).length === 0 ? (
              <p className="text-muted-foreground">Sem movimentações.</p>
            ) : (
              (movements ?? []).map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded border px-2 py-1.5"
                >
                  <div>
                    <span className="font-medium">{STOCK_MOVEMENT_LABELS[m.type]}</span>{' '}
                    <span className="text-muted-foreground">
                      {m.quantity} → saldo {m.balanceAfter}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(m.createdAt).toLocaleString('pt-BR')}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
