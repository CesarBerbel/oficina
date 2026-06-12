'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';
import { useServices, useCombos } from '@/features/catalog/use-catalog';
import { useParts } from '@/features/inventory/use-inventory';
import { useAddFromCatalog } from './use-service-orders';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';

/**
 * Adiciona itens à OS a partir do catálogo:
 * - Serviço: traz o serviço + suas peças padrão (baixa estoque).
 * - Peça: baixa estoque.
 * - Combo: expande nos serviços (não aparece como combo).
 */
export function OsCatalogPicker({ osId }: { osId: string }) {
  const { addService, addPart, addCombo } = useAddFromCatalog(osId);
  const { data: services } = useServices({ page: 1, pageSize: 100, active: true });
  const { data: combos } = useCombos({ page: 1, pageSize: 100 });
  const { data: parts } = useParts({ page: 1, pageSize: 100 });

  const [serviceId, setServiceId] = useState('');
  const [comboId, setComboId] = useState('');
  const [partId, setPartId] = useState('');
  const [partQty, setPartQty] = useState('1');

  const serviceOptions = useMemo(
    () => (services?.data ?? []).map((s) => ({ value: s.id, label: s.name })),
    [services],
  );
  const comboOptions = useMemo(
    () => (combos?.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    [combos],
  );
  const partOptions = useMemo(
    () =>
      (parts?.data ?? []).map((p) => ({
        value: p.id,
        label: `${p.name} (${p.currentStock} ${p.unit})`,
        keywords: p.name,
      })),
    [parts],
  );

  async function run<T>(fn: () => Promise<T>, ok: string, reset: () => void) {
    try {
      await fn();
      toast.success(ok);
      reset();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao adicionar');
    }
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      {/* Serviço */}
      <div className="flex gap-2">
        <SearchableSelect
          className="flex-1"
          value={serviceId}
          onChange={setServiceId}
          options={serviceOptions}
          placeholder="Serviço do catálogo..."
        />
        <Button
          size="icon" variant="outline" aria-label="Adicionar serviço" className="shrink-0"
          disabled={!serviceId || addService.isPending}
          onClick={() => run(() => addService.mutateAsync(serviceId), 'Serviço adicionado', () => setServiceId(''))}
        >
          {addService.isPending ? <CarLoader className="size-4 animate-spin" /> : <Plus className="size-4" />}
        </Button>
      </div>

      {/* Combo */}
      <div className="flex gap-2">
        <SearchableSelect
          className="flex-1"
          value={comboId}
          onChange={setComboId}
          options={comboOptions}
          placeholder="Combo (expande nos serviços)..."
        />
        <Button
          size="icon" variant="outline" aria-label="Adicionar combo" className="shrink-0"
          disabled={!comboId || addCombo.isPending}
          onClick={() => run(() => addCombo.mutateAsync(comboId), 'Combo expandido na OS', () => setComboId(''))}
        >
          {addCombo.isPending ? <CarLoader className="size-4 animate-spin" /> : <Plus className="size-4" />}
        </Button>
      </div>

      {/* Peça */}
      <div className="flex gap-2">
        <SearchableSelect
          className="flex-1"
          value={partId}
          onChange={setPartId}
          options={partOptions}
          placeholder="Peça do estoque..."
        />
        <Input
          type="number" step="any" value={partQty}
          onChange={(e) => setPartQty(e.target.value)}
          className="w-20 shrink-0" aria-label="Quantidade da peça"
        />
        <Button
          size="icon" variant="outline" aria-label="Adicionar peça" className="shrink-0"
          disabled={!partId || addPart.isPending}
          onClick={() => run(
            () => addPart.mutateAsync({ partId, quantity: Number(partQty) || 1 }),
            'Peça adicionada (estoque baixado)',
            () => { setPartId(''); setPartQty('1'); },
          )}
        >
          {addPart.isPending ? <CarLoader className="size-4 animate-spin" /> : <Plus className="size-4" />}
        </Button>
      </div>
    </div>
  );
}
