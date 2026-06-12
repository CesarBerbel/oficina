'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import { createServiceSchema, updateServiceSchema, type ServiceDto } from '@oficina/shared';
import { apiErrorMessage, zodFieldErrors } from '@/lib/form-errors';
import { useParts } from '@/features/inventory/use-inventory';
import { useCategories } from '@/features/categories/use-categories';
import { useCreateService, useUpdateService } from './use-catalog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';

interface DefaultPartRow {
  partId: string;
  partName: string;
  quantity: string;
}

const FIELD_LABELS = {
  name: 'Nome',
  category: 'Categoria',
  description: 'Descrição',
  salePrice: 'Preço de venda',
  cost: 'Custo',
  estimatedMinutes: 'Tempo',
  defaultParts: 'Peças padrão',
};

export function ServiceFormDialog({
  open,
  onOpenChange,
  service,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  service?: ServiceDto | null;
}) {
  const isEdit = !!service;
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [salePrice, setSalePrice] = useState('0');
  const [cost, setCost] = useState('0');
  const [estimatedMinutes, setEstimatedMinutes] = useState('');
  const [showOnSite, setShowOnSite] = useState(true);
  const [defaultParts, setDefaultParts] = useState<DefaultPartRow[]>([]);
  const [partToAdd, setPartToAdd] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: partsData } = useParts({ page: 1, pageSize: 100 });
  const { data: categoryData } = useCategories('SERVICE');
  const create = useCreateService();
  const update = useUpdateService(service?.id ?? '');

  // Categorias ativas + a categoria atual do serviço (caso esteja inativa/legada).
  const categoryOptions = Array.from(
    new Set([
      ...(categoryData ?? []).filter((c) => c.active).map((c) => c.name),
      ...(category ? [category] : []),
    ]),
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const pending = create.isPending || update.isPending;

  useEffect(() => {
    if (!open) return;
    if (service) {
      setName(service.name);
      setCategory(service.category ?? '');
      setDescription(service.description ?? '');
      setSalePrice(String(service.salePrice));
      setCost(String(service.cost));
      setEstimatedMinutes(service.estimatedMinutes?.toString() ?? '');
      setShowOnSite(service.showOnSite);
      setDefaultParts(
        service.defaultParts.map((dp) => ({
          partId: dp.partId,
          partName: dp.partName,
          quantity: String(dp.quantity),
        })),
      );
    } else {
      setName(''); setCategory(''); setDescription(''); setSalePrice('0');
      setCost('0'); setEstimatedMinutes(''); setShowOnSite(true); setDefaultParts([]);
    }
    setPartToAdd('');
    setErrors({});
  }, [open, service]);

  function addPart() {
    if (!partToAdd) return;
    if (defaultParts.some((p) => p.partId === partToAdd)) return;
    const part = partsData?.data.find((p) => p.id === partToAdd);
    if (!part) return;
    setDefaultParts((rows) => [...rows, { partId: part.id, partName: part.name, quantity: '1' }]);
    setPartToAdd('');
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name, category, description, salePrice, cost,
      estimatedMinutes: estimatedMinutes || undefined,
      showOnSite,
      defaultParts: defaultParts.map((p) => ({ partId: p.partId, quantity: p.quantity })),
    };
    const schema = isEdit ? updateServiceSchema : createServiceSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error, FIELD_LABELS));
      return;
    }
    try {
      if (isEdit) { await update.mutateAsync(parsed.data); toast.success('Serviço atualizado'); }
      else { await create.mutateAsync(parsed.data as never); toast.success('Serviço criado'); }
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, FIELD_LABELS));
    }
  }

  const availableParts = (partsData?.data ?? []).filter(
    (p) => !defaultParts.some((dp) => dp.partId === p.id),
  );

  const partOptions = useMemo(
    () =>
      availableParts.map((part) => ({
        value: part.id,
        label: part.sku ? `${part.name} · ${part.sku}` : part.name,
        keywords: [
          part.name,
          part.sku,
          part.ean,
          part.brand,
          part.category,
          part.supplier,
          part.description,
        ]
          .filter(Boolean)
          .join(' '),
      })),
    [availableParts],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar serviço' : 'Novo serviço'}</DialogTitle>
          <DialogDescription>Dados do serviço e peças padrão.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label required>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Sem categoria</option>
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label required>Preço de venda</Label>
              <Input type="number" step="0.01" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label required>Custo</Label>
              <Input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Tempo (min)</Label>
              <Input type="number" value={estimatedMinutes} onChange={(e) => setEstimatedMinutes(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={showOnSite}
              onChange={(e) => setShowOnSite(e.target.checked)}
            />
            Exibir este serviço na página pública (site)
          </label>

          {/* Peças padrão */}
          <div className="space-y-2 rounded-lg border p-3">
            <Label>Peças padrão</Label>
            {defaultParts.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma peça padrão.</p>
            )}
            {defaultParts.map((dp, idx) => (
              <div key={dp.partId} className="flex items-center gap-2">
                <span className="flex-1 text-sm">{dp.partName}</span>
                <Input
                  type="number" step="any" value={dp.quantity}
                  onChange={(e) => setDefaultParts((rows) => rows.map((r, i) => i === idx ? { ...r, quantity: e.target.value } : r))}
                  className="w-20"
                />
                <button type="button" onClick={() => setDefaultParts((rows) => rows.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive">
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <SearchableSelect
                value={partToAdd}
                onChange={setPartToAdd}
                options={partOptions}
                placeholder="Adicionar peça padrão..."
                emptyText="Nenhuma peça encontrada"
                className="w-full flex-1"
              />
              <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={addPart}><Plus className="size-4" /></Button>
            </div>
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
