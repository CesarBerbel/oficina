'use client';

import { useEffect, useMemo, useState } from 'react';

import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import {
  createVehicleSchema,
  updateVehicleSchema,
  FUEL_TYPES,
  FUEL_TYPE_LABELS,
  TRANSMISSION_TYPES,
  TRANSMISSION_LABELS,
  type VehicleDto,
} from '@oficina/shared';
import { apiErrorMessage, zodFieldErrors } from '@/lib/form-errors';
import { useCustomers } from '@/features/customers/use-customers';
import { useCreateVehicle, useUpdateVehicle } from './use-vehicles';
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
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle?: VehicleDto | null;
  /** Quando fornecido, o cliente fica fixo (ex.: criar a partir do detalhe). */
  lockedCustomerId?: string;
  lockedCustomerName?: string;
}

const empty = {
  customerId: '',
  plate: '',
  manufacturer: '',
  model: '',
  modelYear: '',
  color: '',
  fuel: '',
  engine: '',
  transmission: '',
  currentKm: '',
  notes: '',
};

const FIELD_LABELS = {
  customerId: 'Cliente',
  plate: 'Placa',
  manufacturer: 'Fabricante',
  model: 'Modelo',
  modelYear: 'Ano/modelo',
  color: 'Cor',
  fuel: 'Combustível',
  engine: 'Motor',
  transmission: 'Câmbio',
  currentKm: 'KM atual',
  notes: 'Observações',
};

export function VehicleFormDialog({
  open,
  onOpenChange,
  vehicle,
  lockedCustomerId,
  lockedCustomerName,
}: Props) {
  const isEdit = !!vehicle;
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: customersData } = useCustomers({ page: 1, pageSize: 500 });
  const create = useCreateVehicle();
  const update = useUpdateVehicle(vehicle?.id ?? '');
  const pending = create.isPending || update.isPending;

  const customerOptions = useMemo(() => {
    const options = new Map<
      string,
      { value: string; label: string; keywords?: string }
    >();

    if (lockedCustomerId && lockedCustomerName) {
      options.set(lockedCustomerId, {
        value: lockedCustomerId,
        label: lockedCustomerName,
        keywords: lockedCustomerName,
      });
    }

    if (vehicle?.customerId) {
      options.set(vehicle.customerId, {
        value: vehicle.customerId,
        label: vehicle.customerName,
        keywords: vehicle.customerName,
      });
    }

    for (const customer of customersData?.data ?? []) {
      options.set(customer.id, {
        value: customer.id,
        label: customer.name,
        keywords: [
          customer.document,
          customer.phone,
          customer.whatsapp,
          customer.email,
          customer.city,
          customer.state,
        ]
          .filter(Boolean)
          .join(' '),
      });
    }

    return [...options.values()].sort((a, b) =>
      a.label.localeCompare(b.label, 'pt-BR'),
    );
  }, [
    customersData?.data,
    lockedCustomerId,
    lockedCustomerName,
    vehicle?.customerId,
    vehicle?.customerName,
  ]);

  useEffect(() => {
    if (!open) return;
    if (vehicle) {
      setForm({
        customerId: vehicle.customerId,
        plate: vehicle.plate,
        manufacturer: vehicle.manufacturer,
        model: vehicle.model,
        modelYear: vehicle.modelYear?.toString() ?? '',
        color: vehicle.color ?? '',
        fuel: vehicle.fuel ?? '',
        engine: vehicle.engine ?? '',
        transmission: vehicle.transmission ?? '',
        currentKm: vehicle.currentKm?.toString() ?? '',
        notes: vehicle.notes ?? '',
      });
    } else {
      setForm({ ...empty, customerId: lockedCustomerId ?? '' });
    }
    setErrors({});
  }, [open, vehicle, lockedCustomerId]);

  function set<K extends keyof typeof empty>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const base = {
      customerId: form.customerId,
      plate: form.plate,
      manufacturer: form.manufacturer,
      model: form.model,
      modelYear: form.modelYear || undefined,
      color: form.color || undefined,
      fuel: form.fuel || undefined,
      engine: form.engine || undefined,
      transmission: form.transmission || undefined,
      currentKm: form.currentKm || undefined,
      notes: form.notes || undefined,
    };

    const parsed = isEdit
      ? updateVehicleSchema.safeParse(base)
      : createVehicleSchema.safeParse(base);

    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error, FIELD_LABELS));
      return;
    }
    setErrors({});
    try {
      if (isEdit) {
        await update.mutateAsync(parsed.data);
        toast.success('Veículo atualizado');
      } else {
        await create.mutateAsync(parsed.data as never);
        toast.success('Veículo criado');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, FIELD_LABELS));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar veículo' : 'Novo veículo'}</DialogTitle>
          <DialogDescription>Dados do veículo e vínculo com o cliente.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Cliente" error={errors.customerId} required>
            <SearchableSelect
              value={form.customerId}
              onChange={(value) => set('customerId', value)}
              options={customerOptions}
              placeholder="Selecione ou pesquise o cliente..."
              emptyText="Nenhum cliente encontrado"
              disabled={!!lockedCustomerId && !isEdit}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Placa" error={errors.plate} required>
              <Input
                value={form.plate}
                onChange={(e) => set('plate', e.target.value.toUpperCase())}
                placeholder="ABC1D23"
              />
            </Field>
            <Field label="Fabricante" error={errors.manufacturer} required>
              <Input value={form.manufacturer} onChange={(e) => set('manufacturer', e.target.value)} />
            </Field>
            <Field label="Modelo" error={errors.model} required>
              <Input value={form.model} onChange={(e) => set('model', e.target.value)} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Ano/modelo" error={errors.modelYear}>
              <Input type="number" value={form.modelYear} onChange={(e) => set('modelYear', e.target.value)} />
            </Field>
            <Field label="Cor">
              <Input value={form.color} onChange={(e) => set('color', e.target.value)} />
            </Field>
            <Field label="Combustível">
              <Select value={form.fuel} onChange={(e) => set('fuel', e.target.value)}>
                <option value="">—</option>
                {FUEL_TYPES.map((f) => (
                  <option key={f} value={f}>
                    {FUEL_TYPE_LABELS[f]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Câmbio">
              <Select value={form.transmission} onChange={(e) => set('transmission', e.target.value)}>
                <option value="">—</option>
                {TRANSMISSION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TRANSMISSION_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Motor">
              <Input value={form.engine} onChange={(e) => set('engine', e.target.value)} placeholder="1.0, 2.0 TSI..." />
            </Field>
            <Field label="KM atual" error={errors.currentKm}>
              <Input type="number" value={form.currentKm} onChange={(e) => set('currentKm', e.target.value)} />
            </Field>
          </div>

          <Field label="Observações">
            <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
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

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label required={required}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
