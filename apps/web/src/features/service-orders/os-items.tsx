'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import {
  SERVICE_ORDER_ITEM_KIND_LABELS,
  type ServiceOrderItemDto,
  type ServiceOrderItemKind,
} from '@oficina/shared';
import { ApiError } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { useAddItem, useRemoveItem, useUpdateItem } from './use-service-orders';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function OsItems({
  osId,
  kind,
  items,
  serviceItems = [],
  editable,
  canWrite,
}: {
  osId: string;
  kind: ServiceOrderItemKind;
  items: ServiceOrderItemDto[];
  /** Itens de serviço da OS — usados para vincular peças (só no painel de Peças). */
  serviceItems?: ServiceOrderItemDto[];
  editable: boolean;
  canWrite: boolean;
}) {
  const add = useAddItem(osId);
  const remove = useRemoveItem(osId);
  const update = useUpdateItem(osId);
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');

  const canLink = kind === 'PART' && editable && canWrite;

  async function onLink(itemId: string, parentItemId: string) {
    try {
      await update.mutateAsync({
        itemId,
        input: { parentItemId: parentItemId || null },
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao vincular');
    }
  }

  const subtotal = items.reduce((acc, i) => acc + i.total, 0);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || !unitPrice) return;
    try {
      await add.mutateAsync({
        kind,
        description: description.trim(),
        quantity: Number(quantity) || 1,
        unitPrice: Number(unitPrice),
      });
      setDescription('');
      setQuantity('1');
      setUnitPrice('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao adicionar');
    }
  }

  async function onRemove(id: string) {
    try {
      await remove.mutateAsync(id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao remover');
    }
  }

  return (
    <div>
      <div className="divide-y rounded-lg border">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
          <span>{SERVICE_ORDER_ITEM_KIND_LABELS[kind]}</span>
          <span className="w-12 text-right">Qtd</span>
          <span className="w-24 text-right">Unitário</span>
          <span className="w-24 text-right">{editable && canWrite ? '' : 'Total'}</span>
        </div>

        {items.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-muted-foreground">
            Nenhum item.
          </p>
        ) : (
          items.map((it) => (
            <div
              key={it.id}
              className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-3 py-2.5 text-sm"
            >
              <div>
                <span>{it.description}</span>
                {it.comboLabel && (
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {it.comboLabel}
                  </span>
                )}
                {canLink ? (
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">↳</span>
                    <select
                      value={it.parentItemId ?? ''}
                      disabled={update.isPending || serviceItems.length === 0}
                      onChange={(e) => onLink(it.id, e.target.value)}
                      className="h-7 max-w-[220px] rounded border border-input bg-background px-1.5 text-xs text-muted-foreground disabled:opacity-50"
                      aria-label="Vincular peça a um serviço"
                    >
                      <option value="">
                        {serviceItems.length === 0
                          ? 'Sem serviços para vincular'
                          : 'Sem vínculo'}
                      </option>
                      {serviceItems.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.description}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  it.linkedServiceName && (
                    <span
                      className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
                      title={`Peça vinculada ao serviço "${it.linkedServiceName}"`}
                    >
                      ↳ {it.linkedServiceName}
                    </span>
                  )
                )}
              </div>
              <span className="w-12 text-right tabular-nums">{it.quantity}</span>
              <span className="w-24 text-right tabular-nums text-muted-foreground">
                {formatCurrency(it.unitPrice)}
              </span>
              <span className="flex w-24 items-center justify-end gap-1 text-right font-medium tabular-nums">
                {formatCurrency(it.total)}
                {editable && canWrite && (
                  <button
                    onClick={() => onRemove(it.id)}
                    className="ml-1 text-muted-foreground hover:text-destructive"
                    aria-label="Remover item"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </span>
            </div>
          ))
        )}

        <div className="flex justify-between px-3 py-2 text-sm font-medium">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="tabular-nums">{formatCurrency(subtotal)}</span>
        </div>
      </div>

      {editable && canWrite && (
        <form onSubmit={onAdd} className="mt-2 flex flex-wrap items-end gap-2">
          <Input
            placeholder={`Adicionar ${SERVICE_ORDER_ITEM_KIND_LABELS[kind].toLowerCase()}...`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-w-[160px] flex-1"
          />
          <Input
            type="number"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-16"
            aria-label="Quantidade"
          />
          <Input
            type="number"
            step="0.01"
            placeholder="R$"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            className="w-24"
            aria-label="Valor unitário"
          />
          <Button type="submit" size="icon" disabled={add.isPending} aria-label="Adicionar">
            {add.isPending ? <CarLoader className="size-4 animate-spin" /> : <Plus className="size-4" />}
          </Button>
        </form>
      )}
    </div>
  );
}
