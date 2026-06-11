'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  PURCHASE_ORDER_STATUS_LABELS,
  type PurchaseOrderDto,
} from '@oficina/shared';
import { apiErrorMessage } from '@/lib/form-errors';
import { useReceivePurchase } from './use-purchases';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export function PurchaseReceiveDialog({
  open, onOpenChange, purchase,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; purchase: PurchaseOrderDto | null;
}) {
  const receive = useReceivePurchase(purchase?.id ?? '');
  const [qty, setQty] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open && purchase) {
      // sugere o restante a receber por item
      const init: Record<string, string> = {};
      for (const it of purchase.items) {
        init[it.id] = String(Math.max(0, it.quantity - it.receivedQuantity));
      }
      setQty(init);
    }
  }, [open, purchase]);

  if (!purchase) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!purchase) return;
    const received = purchase.items
      .map((it) => ({ itemId: it.id, quantity: Number(qty[it.id]) || 0 }))
      .filter((r) => r.quantity > 0);
    if (received.length === 0) { toast.error('Quantidade: informe ao menos uma quantidade para receber'); return; }
    try {
      await receive.mutateAsync({ received });
      toast.success('Recebimento registrado (estoque atualizado)');
      onOpenChange(false);
    } catch (err) { toast.error(apiErrorMessage(err, {}, 'Erro ao receber')); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receber pedido #{purchase.number}</DialogTitle>
          <DialogDescription>
            Status atual: <Badge>{PURCHASE_ORDER_STATUS_LABELS[purchase.status]}</Badge>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-2">
            {purchase.items.map((it) => (
              <div key={it.id} className="flex items-center gap-2 text-sm">
                <div className="flex-1">
                  <p className="font-medium">{it.partName}</p>
                  <p className="text-xs text-muted-foreground">
                    Pedido: {it.quantity} {it.unit} · já recebido: {it.receivedQuantity}
                  </p>
                </div>
                <Input
                  type="number" step="any" className="w-24" aria-label={`Receber ${it.partName}`}
                  value={qty[it.id] ?? ''}
                  onChange={(e) => setQty((q) => ({ ...q, [it.id]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={receive.isPending}>
              {receive.isPending && <Loader2 className="size-4 animate-spin" />}
              Confirmar recebimento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
