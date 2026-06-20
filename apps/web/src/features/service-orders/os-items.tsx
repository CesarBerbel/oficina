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

  async function onDiscount(item: ServiceOrderItemDto, value: string) {
    const pct = Math.min(100, Math.max(0, Number(value.replace(',', '.')) || 0));
    if (pct === item.discountPercent) return;
    try {
      await update.mutateAsync({ itemId: item.id, input: { discountPercent: pct } });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao aplicar desconto');
    }
  }

  // Valor do desconto do item (informativo; é aplicado ao gerar o orçamento).
  const itemDiscountAmount = (it: ServiceOrderItemDto) =>
    (it.total * (it.discountPercent || 0)) / 100;

  // Bloco de descrição (com combo e vínculo de peça) compartilhado entre a
  // tabela do desktop e os cards do mobile, para não duplicar o <select>.
  const renderDescription = (it: ServiceOrderItemDto) => (
    <>
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
              {serviceItems.length === 0 ? 'Sem serviços para vincular' : 'Sem vínculo'}
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
    </>
  );

  return (
    <div>
      {/* Desktop: tabela */}
      <div className="hidden divide-y rounded-lg border sm:block">
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
          <span>{SERVICE_ORDER_ITEM_KIND_LABELS[kind]}</span>
          <span className="w-12 text-right">Qtd</span>
          <span className="w-24 text-right">Unitário</span>
          <span className="w-16 text-right">Desc %</span>
          <span className="w-24 text-right">Total</span>
        </div>

        {items.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-muted-foreground">Nenhum item.</p>
        ) : (
          items.map((it) => (
            <div
              key={it.id}
              className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3 px-3 py-2.5 text-sm"
            >
              <div>{renderDescription(it)}</div>
              <span className="w-12 text-right tabular-nums">{it.quantity}</span>
              <span className="w-24 text-right tabular-nums text-muted-foreground">
                {formatCurrency(it.unitPrice)}
              </span>
              {editable && canWrite ? (
                <input
                  key={`disc-${it.id}-${it.discountPercent}`}
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  defaultValue={it.discountPercent || ''}
                  onBlur={(e) => onDiscount(it, e.target.value)}
                  className="h-8 w-16 rounded-md border bg-background px-2 text-right tabular-nums"
                  placeholder="0"
                  aria-label={`Desconto de ${it.description}`}
                />
              ) : (
                <span className="w-16 text-right tabular-nums text-muted-foreground">
                  {it.discountPercent > 0 ? `${it.discountPercent}%` : '—'}
                </span>
              )}
              <span className="flex w-24 flex-col items-end justify-center text-right font-medium tabular-nums">
                <span className="flex items-center gap-1">
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
                {it.discountPercent > 0 && (
                  <span className="text-[10px] font-normal text-emerald-600">
                    −{formatCurrency(itemDiscountAmount(it))}
                  </span>
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

      {/* Mobile: cards */}
      <div className="space-y-2 sm:hidden">
        <p className="text-xs font-medium text-muted-foreground">
          {SERVICE_ORDER_ITEM_KIND_LABELS[kind]}
        </p>

        {items.length === 0 ? (
          <p className="rounded-lg border px-3 py-4 text-center text-sm text-muted-foreground">
            Nenhum item.
          </p>
        ) : (
          items.map((it) => (
            <div key={it.id} className="rounded-lg border bg-card p-3 text-sm shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">{renderDescription(it)}</div>
                {editable && canWrite && (
                  <button
                    onClick={() => onRemove(it.id)}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label="Remover item"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
                <span>
                  Qtd{' '}
                  <span className="font-medium tabular-nums text-foreground">{it.quantity}</span>
                </span>
                <span>
                  Unit.{' '}
                  <span className="font-medium tabular-nums text-foreground">
                    {formatCurrency(it.unitPrice)}
                  </span>
                </span>
                <span>
                  Total{' '}
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatCurrency(it.total)}
                  </span>
                </span>
              </div>
              {(editable && canWrite) || it.discountPercent > 0 ? (
                <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground">
                  <span>
                    Desconto %
                    {it.discountPercent > 0 && (
                      <span className="ml-1 text-emerald-600">
                        (−{formatCurrency(itemDiscountAmount(it))})
                      </span>
                    )}
                  </span>
                  {editable && canWrite ? (
                    <input
                      key={`mdisc-${it.id}-${it.discountPercent}`}
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      defaultValue={it.discountPercent || ''}
                      onBlur={(e) => onDiscount(it, e.target.value)}
                      className="h-8 w-20 rounded-md border bg-background px-2 text-right tabular-nums text-foreground"
                      placeholder="0"
                      aria-label={`Desconto de ${it.description}`}
                    />
                  ) : (
                    <span className="font-medium tabular-nums text-foreground">
                      {it.discountPercent}%
                    </span>
                  )}
                </div>
              ) : null}
            </div>
          ))
        )}

        <div className="flex justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm font-medium">
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
            {add.isPending ? (
              <CarLoader className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
          </Button>
        </form>
      )}
    </div>
  );
}
