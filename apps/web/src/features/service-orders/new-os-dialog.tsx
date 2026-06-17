'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, User, Car, ClipboardList, ArrowLeft, ArrowRight, Plus } from 'lucide-react';

import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import { createServiceOrderSchema } from '@oficina/shared';
import { apiErrorMessage, zodFieldErrors } from '@/lib/form-errors';
import { cn } from '@/lib/utils';
import { useCustomers } from '@/features/customers/use-customers';
import { useVehicles } from '@/features/vehicles/use-vehicles';
import { CustomerFormDialog } from '@/features/customers/customer-form-dialog';
import { VehicleFormDialog } from '@/features/vehicles/vehicle-form-dialog';
import { AiAssistButton } from '@/features/ai/ai-assist-button';
import { useCreateServiceOrder, useTechnicians } from './use-service-orders';
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
import { SearchableSelect } from '@/components/ui/searchable-select';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FIELD_LABELS = {
  customerId: 'Cliente',
  vehicleId: 'Veículo',
  km: 'KM atual',
  dueDate: 'Data prevista',
  technicianId: 'Técnico responsável',
  reportedProblem: 'Problema relatado',
};

const STEPS = [
  { title: 'Cliente e veículo', icon: User },
  { title: 'Detalhes', icon: Car },
  { title: 'Relato', icon: ClipboardList },
];

export function NewOsDialog({ open, onOpenChange }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [customerId, setCustomerId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [km, setKm] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [reportedProblem, setReportedProblem] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);

  const { data: customers } = useCustomers({ page: 1, pageSize: 100 });
  const { data: vehicles } = useVehicles({
    customerId: customerId || undefined,
    pageSize: 100,
  });
  const { data: technicians } = useTechnicians();
  const create = useCreateServiceOrder();

  const vehicleOptions = useMemo(
    () => (customerId ? (vehicles?.data ?? []) : []),
    [customerId, vehicles],
  );

  const customerSelectOptions = useMemo(
    () =>
      (customers?.data ?? []).map((c) => ({
        value: c.id,
        label: c.name,
        keywords: `${c.phone ?? ''} ${c.document ?? ''}`,
      })),
    [customers],
  );
  const vehicleSelectOptions = useMemo(
    () =>
      vehicleOptions.map((v) => ({
        value: v.id,
        label: `${v.plate} — ${v.manufacturer} ${v.model}`,
        keywords: v.plate,
      })),
    [vehicleOptions],
  );

  useEffect(() => {
    if (open) {
      setStep(0);
      setCustomerId('');
      setVehicleId('');
      setKm('');
      setDueDate('');
      setTechnicianId('');
      setReportedProblem('');
      setErrors({});
      setCustomerDialogOpen(false);
      setVehicleDialogOpen(false);
    }
  }, [open]);

  // Ao escolher o cliente, seleciona automaticamente o primeiro veículo
  // disponível (mantém a escolha do usuário se ainda for válida).
  useEffect(() => {
    if (!customerId) {
      setVehicleId('');
      return;
    }
    setVehicleId((cur) =>
      vehicleOptions.some((v) => v.id === cur)
        ? cur
        : (vehicleOptions[0]?.id ?? ''),
    );
  }, [customerId, vehicleOptions]);

  const customerName =
    customers?.data.find((c) => c.id === customerId)?.name ?? '';
  const vehicleLabel = (() => {
    const v = vehicleOptions.find((veh) => veh.id === vehicleId);
    return v ? `${v.plate} — ${v.manufacturer} ${v.model}` : '';
  })();
  const technicianName =
    technicians?.find((t) => t.id === technicianId)?.name ?? '';

  function validateStep(target: number): boolean {
    const next: Record<string, string> = {};
    if (target >= 0) {
      if (!customerId) next.customerId = 'Selecione o cliente';
      if (!vehicleId) next.vehicleId = 'Selecione o veículo';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function goNext() {
    // Só a etapa 0 tem campos obrigatórios para avançar.
    if (step === 0 && !validateStep(0)) return;
    setErrors({});
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setErrors({});
    setStep((s) => Math.max(s - 1, 0));
  }

  async function onSubmit() {
    const payload = {
      customerId,
      vehicleId,
      km: km || undefined,
      dueDate: dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : undefined,
      technicianId: technicianId || undefined,
      reportedProblem,
    };
    const parsed = createServiceOrderSchema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors = zodFieldErrors(parsed.error, FIELD_LABELS);
      setErrors(fieldErrors);
      // Volta para a etapa do primeiro erro.
      if (fieldErrors.customerId || fieldErrors.vehicleId) setStep(0);
      else if (fieldErrors.km || fieldErrors.dueDate) setStep(1);
      else setStep(2);
      return;
    }
    try {
      const os = await create.mutateAsync(parsed.data);
      toast.success(`OS #${os.number} aberta`);
      onOpenChange(false);
      router.push(`/os/${os.id}?returnTo=${encodeURIComponent('/os')}`);
    } catch (err) {
      toast.error(apiErrorMessage(err, FIELD_LABELS, 'Erro ao abrir OS'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nova Ordem de Serviço</DialogTitle>
          <DialogDescription>
            Após abrir, cliente, veículo, KM e relato ficam travados.
          </DialogDescription>
        </DialogHeader>

        {/* Indicador de etapas */}
        <ol className="flex items-center gap-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < step;
            const active = i === step;
            return (
              <li key={s.title} className="flex flex-1 items-center gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      'grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold',
                      active && 'border-primary bg-primary text-primary-foreground',
                      done && 'border-emerald-600 bg-emerald-600 text-white',
                      !active && !done && 'border-input text-muted-foreground',
                    )}
                  >
                    {done ? <Check className="size-4" /> : <Icon className="size-4" />}
                  </span>
                  <span
                    className={cn(
                      'truncate text-xs font-medium',
                      active ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {s.title}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <span
                    className={cn(
                      'h-px flex-1',
                      i < step ? 'bg-emerald-600' : 'bg-border',
                    )}
                  />
                )}
              </li>
            );
          })}
        </ol>

        <div className="min-h-[220px] space-y-4 py-1">
          {step === 0 && (
            <>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label required>Cliente</Label>
                  <button
                    type="button"
                    onClick={() => setCustomerDialogOpen(true)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <Plus className="size-3.5" /> Novo cliente
                  </button>
                </div>
                <SearchableSelect
                  value={customerId}
                  onChange={setCustomerId}
                  options={customerSelectOptions}
                  placeholder="Buscar cliente por nome, telefone ou documento..."
                  emptyText="Nenhum cliente encontrado"
                />
                {errors.customerId && (
                  <p className="text-xs text-destructive">{errors.customerId}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label required>Veículo</Label>
                  <button
                    type="button"
                    onClick={() => setVehicleDialogOpen(true)}
                    disabled={!customerId}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                  >
                    <Plus className="size-3.5" /> Novo veículo
                  </button>
                </div>
                <SearchableSelect
                  value={vehicleId}
                  onChange={setVehicleId}
                  options={vehicleSelectOptions}
                  disabled={!customerId}
                  placeholder={
                    customerId ? 'Buscar por placa ou modelo...' : 'Escolha o cliente primeiro'
                  }
                  emptyText="Nenhum veículo para este cliente"
                />
                {errors.vehicleId && (
                  <p className="text-xs text-destructive">{errors.vehicleId}</p>
                )}
              </div>
            </>
          )}

          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>KM atual</Label>
                <Input
                  type="number"
                  value={km}
                  onChange={(e) => setKm(e.target.value)}
                  placeholder="Ex.: 85000"
                />
                {errors.km && <p className="text-xs text-destructive">{errors.km}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Data prevista de entrega</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
                {errors.dueDate && <p className="text-xs text-destructive">{errors.dueDate}</p>}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Técnico responsável</Label>
                <Select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
                  <option value="">— a definir —</option>
                  {(technicians ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label required>Problema relatado</Label>
                  <AiAssistButton
                    field="os_report"
                    instruction="Reescreva o relato do cliente de forma clara e organizada para registro na ordem de serviço, mantendo as informações."
                    content={reportedProblem}
                    onResult={setReportedProblem}
                  />
                </div>
                <Textarea
                  value={reportedProblem}
                  onChange={(e) => setReportedProblem(e.target.value)}
                  placeholder="O que o cliente relatou..."
                  rows={4}
                />
                {errors.reportedProblem && (
                  <p className="text-xs text-destructive">{errors.reportedProblem}</p>
                )}
              </div>

              {/* Revisão */}
              <div className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Revisão
                </p>
                <ReviewRow label="Cliente" value={customerName} />
                <ReviewRow label="Veículo" value={vehicleLabel} />
                {km && <ReviewRow label="KM" value={km} />}
                {dueDate && (
                  <ReviewRow
                    label="Previsão"
                    value={new Date(`${dueDate}T12:00:00`).toLocaleDateString('pt-BR')}
                  />
                )}
                <ReviewRow label="Técnico" value={technicianName || '— a definir —'} />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={step === 0 ? () => onOpenChange(false) : goBack}
          >
            {step === 0 ? (
              'Cancelar'
            ) : (
              <>
                <ArrowLeft className="size-4" /> Voltar
              </>
            )}
          </Button>

          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={goNext}>
              Próximo <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button type="button" onClick={onSubmit} disabled={create.isPending}>
              {create.isPending && <CarLoader className="size-4 animate-spin" />}
              Abrir OS
            </Button>
          )}
        </DialogFooter>

        {/* Criação inline de cliente/veículo (autoseleciona o recém-criado) */}
        <CustomerFormDialog
          open={customerDialogOpen}
          onOpenChange={setCustomerDialogOpen}
          onCreated={(id) => setCustomerId(id)}
        />
        <VehicleFormDialog
          open={vehicleDialogOpen}
          onOpenChange={setVehicleDialogOpen}
          lockedCustomerId={customerId || undefined}
          lockedCustomerName={customerName || undefined}
          onCreated={(id) => setVehicleId(id)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value || '—'}</span>
    </div>
  );
}
