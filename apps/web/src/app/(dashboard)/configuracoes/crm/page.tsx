'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react';
import type { CrmSeasonalCampaignDto, CrmSettingsDto, UpdateCrmSettingsInput } from '@oficina/shared';
import { toast } from 'sonner';
import { CarLoader } from '@/components/car-loader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCrmSettings, useUpdateCrmSettings } from '@/features/crm/use-crm';

const MONTHS = [
  ['1', 'Jan'], ['2', 'Fev'], ['3', 'Mar'], ['4', 'Abr'], ['5', 'Mai'], ['6', 'Jun'],
  ['7', 'Jul'], ['8', 'Ago'], ['9', 'Set'], ['10', 'Out'], ['11', 'Nov'], ['12', 'Dez'],
] as const;

type FormState = CrmSettingsDto;

function toNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function CrmSettingsPage() {
  const { data, isLoading } = useCrmSettings();
  const update = useUpdateCrmSettings();
  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (isLoading || !form) {
    return (
      <div className="grid h-64 place-items-center">
        <CarLoader className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  function setField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => (current ? { ...current, [field]: value } : current));
  }

  function setCampaign(index: number, patch: Partial<CrmSeasonalCampaignDto>) {
    setForm((current) => {
      if (!current) return current;
      const seasonalCampaigns = [...current.seasonalCampaigns];
      seasonalCampaigns[index] = { ...seasonalCampaigns[index], ...patch };
      return { ...current, seasonalCampaigns };
    });
  }

  function addCampaign() {
    setForm((current) => {
      if (!current) return current;
      return {
        ...current,
        seasonalCampaigns: [
          ...current.seasonalCampaigns,
          {
            id: `campanha-${Date.now()}`,
            name: 'Nova campanha',
            months: [new Date().getMonth() + 1],
            title: 'Campanha de retenção',
            message: 'Olá, {cliente}. Podemos agendar uma avaliação preventiva do veículo {placa}?',
            vehicleAgeMinYears: null,
          },
        ],
      };
    });
  }

  function removeCampaign(index: number) {
    setForm((current) => {
      if (!current) return current;
      return { ...current, seasonalCampaigns: current.seasonalCampaigns.filter((_, i) => i !== index) };
    });
  }

  async function save() {
    if (!form) return;
    const payload: UpdateCrmSettingsInput = {
      ...form,
      recommendedMaintenanceKeywords: form.recommendedMaintenanceKeywords.map((k) => k.trim()).filter(Boolean),
      seasonalCampaigns: form.seasonalCampaigns.map((campaign) => ({
        ...campaign,
        id: campaign.id.trim(),
        name: campaign.name.trim(),
        title: campaign.title.trim(),
        message: campaign.message.trim(),
        months: [...new Set(campaign.months)].sort((a, b) => a - b),
        vehicleAgeMinYears: campaign.vehicleAgeMinYears ?? null,
      })),
    };
    await update.mutateAsync(payload);
    toast.success('Configurações do CRM salvas');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 px-0">
            <Link href="/configuracoes"><ArrowLeft /> Configurações</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">CRM pós-venda</h1>
          <p className="text-muted-foreground">Configure regras automáticas de revisão, retenção, recuperação e campanhas.</p>
        </div>
        <Button onClick={save} disabled={update.isPending}>
          <Save /> Salvar configurações
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Regras gerais</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Check label="CRM ativo" checked={form.enabled} onChange={(v) => setField('enabled', v)} />
          <Check label="Revisão por tempo" checked={form.enablePreventiveReview} onChange={(v) => setField('enablePreventiveReview', v)} />
          <Check label="Revisão por KM" checked={form.enableKmReview} onChange={(v) => setField('enableKmReview', v)} />
          <Check label="Clientes inativos" checked={form.enableInactiveCustomers} onChange={(v) => setField('enableInactiveCustomers', v)} />
          <Check label="Retorno pós-entrega" checked={form.enablePostDeliveryReturn} onChange={(v) => setField('enablePostDeliveryReturn', v)} />
          <Check label="Recuperar orçamento recusado" checked={form.enableRefusedQuoteRecovery} onChange={(v) => setField('enableRefusedQuoteRecovery', v)} />
          <Check label="Manutenções recomendadas" checked={form.enableRecommendedMaintenance} onChange={(v) => setField('enableRecommendedMaintenance', v)} />
          <Check label="Campanhas sazonais" checked={form.enableSeasonalCampaigns} onChange={(v) => setField('enableSeasonalCampaigns', v)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Prazos, quilometragem e prioridade</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <NumberField label="Revisão a cada X dias" value={form.reviewIntervalDays} onChange={(v) => setField('reviewIntervalDays', v)} />
          <NumberField label="Revisão a cada X km" value={form.reviewIntervalKm} onChange={(v) => setField('reviewIntervalKm', v)} />
          <NumberField label="Avisar faltando X km" value={form.reviewKmWarning} onChange={(v) => setField('reviewKmWarning', v)} />
          <NumberField label="Cliente inativo após dias" value={form.inactiveCustomerDays} onChange={(v) => setField('inactiveCustomerDays', v)} />
          <NumberField label="Pós-entrega início" value={form.postDeliveryStartDays} onChange={(v) => setField('postDeliveryStartDays', v)} />
          <NumberField label="Pós-entrega fim" value={form.postDeliveryEndDays} onChange={(v) => setField('postDeliveryEndDays', v)} />
          <NumberField label="Recuperar recusados até dias" value={form.refusedQuoteRecoveryDays} onChange={(v) => setField('refusedQuoteRecoveryDays', v)} />
          <NumberField label="Recusado com idade mínima" value={form.refusedQuoteMinimumAgeDays} onChange={(v) => setField('refusedQuoteMinimumAgeDays', v)} />
          <NumberField label="Prioridade média a partir de dias" value={form.mediumPriorityDays} onChange={(v) => setField('mediumPriorityDays', v)} />
          <NumberField label="Prioridade alta a partir de dias" value={form.highPriorityDays} onChange={(v) => setField('highPriorityDays', v)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Manutenções recomendadas</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Label>Palavras-chave em diagnóstico, problema relatado ou observações da OS</Label>
          <Textarea
            value={form.recommendedMaintenanceKeywords.join(', ')}
            onChange={(event) => setField('recommendedMaintenanceKeywords', event.target.value.split(',').map((v) => v.trim()))}
            placeholder="recomend, retornar, acompanhar, atenção"
          />
          <p className="text-xs text-muted-foreground">Quando uma OS entregue contém uma dessas palavras, o CRM cria oportunidade de acompanhamento.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Campanhas sazonais</CardTitle>
          <Button type="button" variant="outline" onClick={addCampaign}><Plus /> Adicionar</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {form.seasonalCampaigns.map((campaign, index) => (
            <div key={campaign.id} className="space-y-4 rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="grid flex-1 gap-4 md:grid-cols-2">
                  <TextField label="Nome" value={campaign.name} onChange={(v) => setCampaign(index, { name: v })} />
                  <TextField label="Título da oportunidade" value={campaign.title} onChange={(v) => setCampaign(index, { title: v })} />
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeCampaign(index)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                <div className="space-y-2">
                  <Label>Mensagem WhatsApp</Label>
                  <Textarea value={campaign.message} onChange={(event) => setCampaign(index, { message: event.target.value })} />
                  <p className="text-xs text-muted-foreground">Variáveis disponíveis: {'{cliente}'}, {'{placa}'} e {'{veiculo}'}.</p>
                </div>
                <NumberField
                  label="Idade mínima do veículo"
                  value={campaign.vehicleAgeMinYears ?? 0}
                  onChange={(v) => setCampaign(index, { vehicleAgeMinYears: v <= 0 ? null : v })}
                />
              </div>
              <div className="space-y-2">
                <Label>Meses ativos</Label>
                <div className="flex flex-wrap gap-2">
                  {MONTHS.map(([value, label]) => {
                    const month = Number(value);
                    const active = campaign.months.includes(month);
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setCampaign(index, {
                          months: active ? campaign.months.filter((m) => m !== month) : [...campaign.months, month],
                        })}
                        className={`rounded-full border px-3 py-1 text-sm ${active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background'}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type="number" value={value} onChange={(event) => onChange(toNumber(event.target.value, value))} />
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
