'use client';

import { PURCHASE_ORDER_STATUS_LABELS, type PurchaseOrderDto } from '@oficina/shared';
import { CarLoader } from '@/components/car-loader';
import { formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function PurchaseItemsDialog({
  open,
  onOpenChange,
  purchase,
  loading,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  purchase: PurchaseOrderDto | null;
  loading?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Produtos do pedido{purchase ? ` #${purchase.number}` : ''}</DialogTitle>
          <DialogDescription>
            {purchase ? (
              <>
                {purchase.supplierName ?? 'Sem fornecedor'} ·{' '}
                <Badge variant="secondary">{PURCHASE_ORDER_STATUS_LABELS[purchase.status]}</Badge>
                {purchase.serviceOrderNumber != null &&
                  ` · gerado pela OS #${purchase.serviceOrderNumber}`}
              </>
            ) : (
              'Itens do pedido de compra.'
            )}
          </DialogDescription>
        </DialogHeader>

        {loading || !purchase ? (
          <div className="grid h-24 place-items-center">
            <CarLoader className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 border-b pb-1 text-xs font-medium text-muted-foreground">
              <span>Produto</span>
              <span className="text-right">Qtd</span>
              <span className="text-right">Recebido</span>
              <span className="text-right">Total</span>
            </div>
            {purchase.items.map((it) => (
              <div
                key={it.id}
                className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 border-b py-1.5 text-sm last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{it.partName}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(it.unitCost)} / {it.unit}
                  </p>
                </div>
                <span className="text-right tabular-nums">
                  {it.quantity} {it.unit}
                </span>
                <span
                  className={`text-right tabular-nums ${it.receivedQuantity >= it.quantity ? 'text-emerald-600' : 'text-muted-foreground'}`}
                >
                  {it.receivedQuantity}
                </span>
                <span className="text-right font-medium tabular-nums">
                  {formatCurrency(it.total)}
                </span>
              </div>
            ))}
            <div className="flex justify-between border-t pt-2 font-medium">
              <span>Total do pedido</span>
              <span>{formatCurrency(purchase.total)}</span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
