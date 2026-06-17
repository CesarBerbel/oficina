'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import type { UpdateOperationalSettingsInput } from '@oficina/shared';
import {
  useOperationalSettings,
  useUpdateOperationalSettings,
} from '@/features/operational/use-operational';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const DEFAULTS: UpdateOperationalSettingsInput = {
  appointmentLookaheadHours: 12,
  waitingCustomerMinutes: 30,
  stalledServiceOrderHours: 24,
  pendingApprovalHours: 24,
  crmHighPriorityLimit: 10,
  enableAppointmentAlerts: true,
  enableWaitingCustomerAlerts: true,
  enableStalledOsAlerts: true,
  enablePendingApprovalAlerts: true,
  enableCrmAlerts: true,
};

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

export default function ConfiguracaoOperacionalPage() {
  const { data } = useOperationalSettings();
  const update = useUpdateOperationalSettings();
  const [form, setForm] = useState<UpdateOperationalSettingsInput>(DEFAULTS);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  function setNumber(key: keyof UpdateOperationalSettingsInput, value: string) {
    setForm((current) => ({ ...current, [key]: Number(value) }));
  }

  function setBool(key: keyof UpdateOperationalSettingsInput, value: boolean) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function save() {
    update.mutate(form, { onSuccess: () => toast.success('Regras operacionais salvas') });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
            <Link href="/configuracoes">
              <ArrowLeft className="mr-2 size-4" /> Configurações
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Regras operacionais</h1>
          <p className="text-muted-foreground">
            Configure o Dashboard Operacional e a priorização do inbox unificado.
          </p>
        </div>
        <Button onClick={save} disabled={update.isPending}>
          Salvar regras
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-4 p-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Janela de próximas chegadas (horas)</Label>
            <Input
              type="number"
              min={1}
              max={72}
              value={form.appointmentLookaheadHours}
              onChange={(e) => setNumber('appointmentLookaheadHours', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Cliente aguardando sem OS (minutos)</Label>
            <Input
              type="number"
              min={5}
              max={480}
              value={form.waitingCustomerMinutes}
              onChange={(e) => setNumber('waitingCustomerMinutes', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>OS parada sem atualização (horas)</Label>
            <Input
              type="number"
              min={1}
              max={720}
              value={form.stalledServiceOrderHours}
              onChange={(e) => setNumber('stalledServiceOrderHours', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Orçamento aguardando aprovação (horas)</Label>
            <Input
              type="number"
              min={1}
              max={720}
              value={form.pendingApprovalHours}
              onChange={(e) => setNumber('pendingApprovalHours', e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Limite para alerta de CRM prioritário</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={form.crmHighPriorityLimit}
              onChange={(e) => setNumber('crmHighPriorityLimit', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3 p-5 md:grid-cols-2">
          <Check
            label="Alertar próximas chegadas"
            checked={form.enableAppointmentAlerts}
            onChange={(v) => setBool('enableAppointmentAlerts', v)}
          />
          <Check
            label="Alertar clientes aguardando"
            checked={form.enableWaitingCustomerAlerts}
            onChange={(v) => setBool('enableWaitingCustomerAlerts', v)}
          />
          <Check
            label="Alertar OS paradas"
            checked={form.enableStalledOsAlerts}
            onChange={(v) => setBool('enableStalledOsAlerts', v)}
          />
          <Check
            label="Alertar orçamentos vencidos"
            checked={form.enablePendingApprovalAlerts}
            onChange={(v) => setBool('enablePendingApprovalAlerts', v)}
          />
          <Check
            label="Alertar CRM prioritário"
            checked={form.enableCrmAlerts}
            onChange={(v) => setBool('enableCrmAlerts', v)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
