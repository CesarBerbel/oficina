'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import { createServiceOrderSchema } from '@oficina/shared';
import { apiErrorMessage, zodFieldErrors } from '@/lib/form-errors';
import { useCustomers } from '@/features/customers/use-customers';
import { useVehicles } from '@/features/vehicles/use-vehicles';
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FIELD_LABELS = {
  customerId: 'Cliente',
  vehicleId: 'Veículo',
  km: 'KM atual',
  technicianId: 'Técnico responsável',
  reportedProblem: 'Problema relatado',
};

export function NewOsDialog({ open, onOpenChange }: Props) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [km, setKm] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [reportedProblem, setReportedProblem] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

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

  useEffect(() => {
    if (open) {
      setCustomerId('');
      setVehicleId('');
      setKm('');
      setTechnicianId('');
      setReportedProblem('');
      setErrors({});
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      customerId,
      vehicleId,
      km: km || undefined,
      technicianId: technicianId || undefined,
      reportedProblem,
    };
    const parsed = createServiceOrderSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error, FIELD_LABELS));
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

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label required>Cliente</Label>
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Selecione...</option>
              {(customers?.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            {errors.customerId && <p className="text-xs text-destructive">{errors.customerId}</p>}
          </div>

          <div className="space-y-1.5">
            <Label required>Veículo</Label>
            <Select
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              disabled={!customerId}
            >
              <option value="">
                {customerId ? 'Selecione...' : 'Escolha o cliente primeiro'}
              </option>
              {vehicleOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate} — {v.manufacturer} {v.model}
                </option>
              ))}
            </Select>
            {errors.vehicleId && <p className="text-xs text-destructive">{errors.vehicleId}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>KM atual</Label>
              <Input type="number" value={km} onChange={(e) => setKm(e.target.value)} />
            </div>
            <div className="space-y-1.5">
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

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label required>Problema relatado</Label>
              <AiAssistButton
                instruction="Reescreva o relato do cliente de forma clara e organizada para registro na ordem de serviço, mantendo as informações."
                content={reportedProblem}
                onResult={setReportedProblem}
              />
            </div>
            <Textarea
              value={reportedProblem}
              onChange={(e) => setReportedProblem(e.target.value)}
              placeholder="O que o cliente relatou..."
              rows={3}
            />
            {errors.reportedProblem && (
              <p className="text-xs text-destructive">{errors.reportedProblem}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <CarLoader className="size-4 animate-spin" />}
              Abrir OS
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
