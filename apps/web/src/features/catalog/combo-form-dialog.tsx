'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import { createComboSchema, updateComboSchema, type ComboDto } from '@oficina/shared';
import { apiErrorMessage, zodFieldErrors } from '@/lib/form-errors';
import { useServices, useCreateCombo, useUpdateCombo } from './use-catalog';
import { ServiceFormDialog } from './service-form-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { formatCurrency } from '@/lib/utils';

interface Row { serviceId: string; name: string; price: number }

const FIELD_LABELS = {
  name: 'Nome',
  description: 'Descrição',
  serviceIds: 'Serviços incluídos',
};

export function ComboFormDialog({
  open, onOpenChange, combo,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; combo?: ComboDto | null;
}) {
  const isEdit = !!combo;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [services, setServices] = useState<Row[]>([]);
  const [toAdd, setToAdd] = useState('');
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: servicesData } = useServices({ page: 1, pageSize: 100, active: true });
  const create = useCreateCombo();
  const update = useUpdateCombo(combo?.id ?? '');
  const pending = create.isPending || update.isPending;

  useEffect(() => {
    if (!open) return;
    if (combo) {
      setName(combo.name);
      setDescription(combo.description ?? '');
      setServices(combo.services.map((s) => ({ serviceId: s.serviceId, name: s.serviceName, price: s.salePrice })));
    } else {
      setName(''); setDescription(''); setServices([]);
    }
    setToAdd(''); setServiceDialogOpen(false); setErrors({});
  }, [open, combo]);

  function addService() {
    if (!toAdd || services.some((s) => s.serviceId === toAdd)) return;
    const svc = servicesData?.data.find((s) => s.id === toAdd);
    if (!svc) return;
    setServices((rows) => [...rows, { serviceId: svc.id, name: svc.name, price: svc.salePrice }]);
    setToAdd('');
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { name, description, serviceIds: services.map((s) => s.serviceId) };
    const schema = isEdit ? updateComboSchema : createComboSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error, FIELD_LABELS));
      return;
    }
    try {
      if (isEdit) { await update.mutateAsync(parsed.data); toast.success('Combo atualizado'); }
      else { await create.mutateAsync(parsed.data as never); toast.success('Combo criado'); }
      onOpenChange(false);
    } catch (err) { toast.error(apiErrorMessage(err, FIELD_LABELS)); }
  }

  const available = (servicesData?.data ?? []).filter((s) => !services.some((r) => r.serviceId === s.id));
  const serviceOptions = useMemo(
    () =>
      available.map((service) => ({
        value: service.id,
        label: service.category
          ? `${service.name} · ${service.category}`
          : service.name,
        keywords: [
          service.name,
          service.category,
          service.description,
          service.salePrice,
          service.estimatedMinutes,
        ]
          .filter((value) => value !== null && value !== undefined && value !== '')
          .join(' '),
      })),
    [available],
  );
  const total = services.reduce((acc, s) => acc + s.price, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar combo' : 'Novo combo'}</DialogTitle>
          <DialogDescription>
            Agrupamento interno de serviços. Na OS, expande nos serviços (não aparece como combo).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label required>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <Label required>Serviços incluídos</Label>
              <button
                type="button"
                onClick={() => setServiceDialogOpen(true)}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Plus className="size-3.5" /> Novo serviço
              </button>
            </div>
            {services.length === 0 && <p className="text-xs text-muted-foreground">Nenhum serviço.</p>}
            {services.map((s, idx) => (
              <div key={s.serviceId} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex-1">{s.name}</span>
                <span className="text-muted-foreground">{formatCurrency(s.price)}</span>
                <button type="button" onClick={() => setServices((r) => r.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive">
                  <X className="size-4" />
                </button>
              </div>
            ))}
            {services.length > 0 && (
              <div className="flex justify-between border-t pt-2 text-sm font-medium">
                <span>Total dos serviços</span>
                <span>{formatCurrency(total)}</span>
              </div>
            )}
            <div className="flex gap-2">
              <SearchableSelect
                value={toAdd}
                onChange={setToAdd}
                options={serviceOptions}
                placeholder="Adicionar serviço..."
                emptyText="Nenhum serviço encontrado"
                className="w-full flex-1"
              />
              <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={addService}><Plus className="size-4" /></Button>
            </div>
            {errors.serviceIds && <p className="text-xs text-destructive">{errors.serviceIds}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={pending}>
              {pending && <CarLoader className="size-4 animate-spin" />}
              {isEdit ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>

        {/* Cadastro inline de serviço: adiciona o recém-criado ao combo */}
        <ServiceFormDialog
          open={serviceDialogOpen}
          onOpenChange={setServiceDialogOpen}
          onCreated={(svc) =>
            setServices((rows) =>
              rows.some((r) => r.serviceId === svc.id)
                ? rows
                : [...rows, { serviceId: svc.id, name: svc.name, price: svc.salePrice }],
            )
          }
        />
      </DialogContent>
    </Dialog>
  );
}
