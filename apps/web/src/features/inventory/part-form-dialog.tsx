'use client';

import { useEffect, useState } from 'react';

import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import {
  createPartSchema,
  updatePartSchema,
  PART_TYPES,
  PART_TYPE_LABELS,
  type PartDto,
} from '@oficina/shared';
import { apiErrorMessage, zodFieldErrors } from '@/lib/form-errors';
import { useCreatePart, useUpdatePart } from './use-inventory';
import { useSuppliers } from '@/features/purchases/use-purchases';
import { useCategories } from '@/features/categories/use-categories';
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
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  part?: PartDto | null;
  /** Chamado com a peça recém-criada (ex.: peça padrão inline no serviço). */
  onCreated?: (part: { id: string; name: string }) => void;
}

const empty = {
  name: '',
  sku: '',
  ean: '',
  type: 'PECA',
  category: '',
  brand: '',
  unit: 'UN',
  minStock: '0',
  costPrice: '0',
  salePrice: '0',
  supplierId: '',
  description: '',
  initialStock: '0',
};

const FIELD_LABELS = {
  name: 'Nome',
  sku: 'SKU',
  ean: 'Código de barras',
  type: 'Tipo',
  category: 'Categoria',
  brand: 'Marca',
  unit: 'Unidade',
  minStock: 'Estoque mínimo',
  costPrice: 'Preço de custo',
  salePrice: 'Preço de venda',
  supplierId: 'Fornecedor',
  description: 'Descrição',
  initialStock: 'Estoque inicial',
};

export function PartFormDialog({ open, onOpenChange, part, onCreated }: Props) {
  const isEdit = !!part;
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreatePart();
  const update = useUpdatePart(part?.id ?? '');
  const pending = create.isPending || update.isPending;
  const { data: suppliersData } = useSuppliers({ page: 1, pageSize: 100 });
  const suppliers = suppliersData?.data ?? [];
  const { data: categoryData } = useCategories('PART');
  const categoryOptions = Array.from(
    new Set([
      ...(categoryData ?? []).filter((c) => c.active).map((c) => c.name),
      ...(form.category ? [form.category] : []),
    ]),
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  useEffect(() => {
    if (!open) return;
    if (part) {
      setForm({
        name: part.name,
        sku: part.sku ?? '',
        ean: part.ean ?? '',
        type: part.type,
        category: part.category ?? '',
        brand: part.brand ?? '',
        unit: part.unit,
        minStock: String(part.minStock),
        costPrice: String(part.costPrice),
        salePrice: String(part.salePrice),
        supplierId: part.supplierId ?? '',
        description: part.description ?? '',
        initialStock: '0',
      });
    } else {
      setForm(empty);
    }
    setErrors({});
  }, [open, part]);

  function set<K extends keyof typeof empty>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(addAnother: boolean) {
    const schema = isEdit ? updatePartSchema : createPartSchema;
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error, FIELD_LABELS));
      return;
    }
    try {
      if (isEdit) {
        await update.mutateAsync(parsed.data);
        toast.success('Peça atualizada');
      } else {
        const createdPart = (await create.mutateAsync(parsed.data as never)) as PartDto;
        toast.success('Peça cadastrada');
        // Em "adicionar outro" não seleciona (mantém o fluxo de cadastro em série).
        if (!addAnother) onCreated?.({ id: createdPart.id, name: createdPart.name });
      }
      if (addAnother && !isEdit) {
        setForm(empty);
        setErrors({});
      } else {
        onOpenChange(false);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, FIELD_LABELS));
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void submit(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar peça/insumo' : 'Nova peça/insumo'}</DialogTitle>
          <DialogDescription>Dados de cadastro e estoque.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <F label="Nome" error={errors.name} className="sm:col-span-2" required>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
            </F>
            <F label="Tipo" required>
              <Select value={form.type} onChange={(e) => set('type', e.target.value)}>
                {PART_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {PART_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </F>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <F label="SKU" error={errors.sku}>
              <Input value={form.sku} onChange={(e) => set('sku', e.target.value)} />
            </F>
            <F label="Código de barras">
              <Input value={form.ean} onChange={(e) => set('ean', e.target.value)} />
            </F>
            <F label="Marca">
              <Input value={form.brand} onChange={(e) => set('brand', e.target.value)} />
            </F>
            <F label="Categoria">
              <Select value={form.category} onChange={(e) => set('category', e.target.value)}>
                <option value="">Sem categoria</option>
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </F>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <F label="Unidade" required>
              <Input value={form.unit} onChange={(e) => set('unit', e.target.value)} />
            </F>
            <F label="Estoque mínimo" required>
              <Input
                type="number"
                step="any"
                value={form.minStock}
                onChange={(e) => set('minStock', e.target.value)}
              />
            </F>
            <F label="Preço de custo" required>
              <Input
                type="number"
                step="0.01"
                value={form.costPrice}
                onChange={(e) => set('costPrice', e.target.value)}
              />
            </F>
            <F label="Preço de venda" required>
              <Input
                type="number"
                step="0.01"
                value={form.salePrice}
                onChange={(e) => set('salePrice', e.target.value)}
              />
            </F>
          </div>

          {!isEdit && (
            <F label="Estoque inicial (gera entrada)" required>
              <Input
                type="number"
                step="any"
                value={form.initialStock}
                onChange={(e) => set('initialStock', e.target.value)}
              />
            </F>
          )}

          <F label="Fornecedor" error={errors.supplierId}>
            <Select value={form.supplierId} onChange={(e) => set('supplierId', e.target.value)}>
              <option value="">Sem fornecedor</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </F>
          <F label="Descrição">
            <Textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </F>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            {!isEdit && (
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => void submit(true)}
              >
                Salvar e adicionar outro
              </Button>
            )}
            <Button type="submit" disabled={pending}>
              {pending && <CarLoader className="size-4 animate-spin" />}
              {isEdit ? 'Salvar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function F({
  label,
  error,
  className,
  required,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label required={required}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
