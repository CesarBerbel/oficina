'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import {
  createCheckinSchema,
  CHECKLIST_STATUSES,
  CHECKLIST_STATUS_LABELS,
  ChecklistStatus,
  DEFAULT_CHECKLIST_ITEMS,
  FUEL_LEVELS,
  FUEL_LEVEL_LABELS,
  type ChecklistItem,
  type DamagePoint,
  type FuelLevel,
} from '@oficina/shared';
import { apiErrorMessage, zodFieldErrors } from '@/lib/form-errors';
import { useServiceOrders } from '@/features/service-orders/use-service-orders';
import { useCreateCheckin } from '@/features/checkins/use-checkins';
import { DamageDiagram } from '@/components/damage-diagram';
import { PhotoGrid } from '@/components/photo-grid';
import { SignaturePad } from '@/components/signature-pad';
import { Button } from '@/components/ui/button';
import { BackButton } from '@/components/back-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const STATUS_STYLE: Record<ChecklistStatus, string> = {
  OK: 'data-[on=true]:bg-emerald-500 data-[on=true]:text-white',
  ATENCAO: 'data-[on=true]:bg-amber-500 data-[on=true]:text-white',
  FALHA: 'data-[on=true]:bg-red-500 data-[on=true]:text-white',
  NA: 'data-[on=true]:bg-muted-foreground data-[on=true]:text-white',
};

const FIELD_LABELS = {
  serviceOrderId: 'Ordem de Serviço',
  vehicleId: 'Veículo',
  km: 'Quilometragem',
  fuelLevel: 'Combustível',
  checklist: 'Checklist',
  damages: 'Avarias',
  photos: 'Fotos',
  signatureUrl: 'Assinatura',
  signedBy: 'Nome do responsável',
  notes: 'Observações gerais',
};

function CheckinFormContent() {
  const router = useRouter();
  const params = useSearchParams();
  const presetOsId = params.get('osId') ?? '';
  const presetVehicleId = params.get('vehicleId') ?? '';
  const returnTo = params.get('returnTo') ?? '';

  const { data: osData } = useServiceOrders({ page: 1, pageSize: 100 });
  const orders = useMemo(() => osData?.data ?? [], [osData]);
  const create = useCreateCheckin();

  const [serviceOrderId, setServiceOrderId] = useState(presetOsId);
  const selectedOs = useMemo(
    () => orders.find((o) => o.id === serviceOrderId),
    [orders, serviceOrderId],
  );
  // O veículo é sempre o da OS selecionada (fallback: veículo passado na URL).
  const vehicleId = selectedOs?.vehicleId ?? presetVehicleId;

  const osOptions = useMemo(
    () =>
      orders.map((o) => ({
        value: o.id,
        label: `OS #${o.number} · ${o.vehiclePlate} ${o.vehicleLabel} · ${o.customerName}`,
        keywords: `${o.vehiclePlate} ${o.customerName}`,
      })),
    [orders],
  );

  const [km, setKm] = useState('');
  const [fuelLevel, setFuelLevel] = useState('');
  const [checklist, setChecklist] = useState<ChecklistItem[]>(
    DEFAULT_CHECKLIST_ITEMS.map((item) => ({
      item,
      status: ChecklistStatus.OK,
    })),
  );
  const [damages, setDamages] = useState<DamagePoint[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [signatureUrl, setSignatureUrl] = useState('');
  const [signedBy, setSignedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (presetOsId) setServiceOrderId(presetOsId);
  }, [presetOsId]);

  function setItem(i: number, patch: Partial<ChecklistItem>) {
    setChecklist((list) => list.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      vehicleId,
      serviceOrderId,
      km: km || undefined,
      fuelLevel: fuelLevel || undefined,
      checklist,
      damages,
      photos,
      signatureUrl: signatureUrl || undefined,
      signedBy: signedBy || undefined,
      notes: notes || undefined,
    };

    const parsed = createCheckinSchema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors = zodFieldErrors(parsed.error, FIELD_LABELS);
      setErrors(fieldErrors);
      toast.error(Object.values(fieldErrors)[0] ?? 'Verifique os campos destacados.');
      return;
    }
    setErrors({});
    try {
      const created = await create.mutateAsync(parsed.data);
      toast.success('Check-in registrado');
      const qs = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
      router.push(`/check-in/${created.id}${qs}`);
    } catch (err) {
      toast.error(apiErrorMessage(err, FIELD_LABELS));
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-5 pb-10">
      <div className="flex items-center gap-3">
        <BackButton fallbackHref="/check-in" iconOnly />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Check-in do veículo</h1>
          <p className="text-muted-foreground">
            Estado do veículo no recebimento, vinculado a uma OS.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Identificação</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-3">
            <Label required>Ordem de Serviço</Label>
            <SearchableSelect
              value={serviceOrderId}
              onChange={setServiceOrderId}
              options={osOptions}
              disabled={!!presetOsId}
              placeholder="Selecione a OS..."
              emptyText="Nenhuma OS encontrada"
            />
            {(errors.serviceOrderId || errors.vehicleId) && (
              <p className="text-xs text-destructive">
                {errors.serviceOrderId ?? errors.vehicleId}
              </p>
            )}
          </div>
          <div className="space-y-1.5 sm:col-span-3">
            <Label>Veículo</Label>
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              {selectedOs
                ? `${selectedOs.vehiclePlate} — ${selectedOs.vehicleLabel} · ${selectedOs.customerName}`
                : 'Selecione a OS para definir o veículo.'}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Quilometragem</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={km}
              onChange={(e) => setKm(e.target.value)}
              placeholder="Ex.: 84500"
            />
            {errors.km && <p className="text-xs text-destructive">{errors.km}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Combustível</Label>
            <Select value={fuelLevel} onChange={(e) => setFuelLevel(e.target.value)}>
              <option value="">—</option>
              {FUEL_LEVELS.map((f) => (
                <option key={f} value={f}>
                  {FUEL_LEVEL_LABELS[f as FuelLevel]}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Checklist de inspeção</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {checklist.map((it, i) => (
            <div
              key={it.item}
              className="flex flex-wrap items-center gap-2 border-b py-2 last:border-0"
            >
              <span className="min-w-40 flex-1 text-sm">{it.item}</span>
              <div className="flex gap-1">
                {CHECKLIST_STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    data-on={it.status === s}
                    onClick={() => setItem(i, { status: s })}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${STATUS_STYLE[s]}`}
                  >
                    {CHECKLIST_STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
              {it.status !== ChecklistStatus.OK && it.status !== ChecklistStatus.NA && (
                <Input
                  className="basis-full sm:basis-auto sm:flex-1"
                  placeholder="Observação"
                  value={it.note ?? ''}
                  onChange={(e) => setItem(i, { note: e.target.value })}
                />
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Avarias</CardTitle>
        </CardHeader>
        <CardContent>
          <DamageDiagram value={damages} onChange={setDamages} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fotos</CardTitle>
        </CardHeader>
        <CardContent>
          <PhotoGrid value={photos} onChange={setPhotos} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Observações e assinatura</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Observações gerais</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Itens pessoais, combinados com o cliente, etc."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Nome do responsável</Label>
            <Input
              value={signedBy}
              onChange={(e) => setSignedBy(e.target.value)}
              placeholder="Quem entregou o veículo"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Assinatura</Label>
            <SignaturePad value={signatureUrl} onChange={setSignatureUrl} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <BackButton fallbackHref="/check-in" label="Cancelar" variant="outline" />
        <Button type="submit" disabled={create.isPending}>
          {create.isPending && <CarLoader className="size-4 animate-spin" />}
          Registrar check-in
        </Button>
      </div>
    </form>
  );
}

export default function NewCheckinPage() {
  return (
    <Suspense
      fallback={
        <div className="grid h-64 place-items-center">
          <CarLoader className="size-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <CheckinFormContent />
    </Suspense>
  );
}
