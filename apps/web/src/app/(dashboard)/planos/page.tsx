'use client';

import { useState } from 'react';
import { CreditCard, Plus, Pencil, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import {
  PLAN_FEATURE_LABELS,
  planFeatureKeySchema,
  upsertPlanSchema,
  type PlanDto,
  type PlanFeatureKey,
  type UpsertPlanInput,
} from '@oficina/shared';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { usePlatformPlans, useUpsertPlan } from '@/features/platform/use-accounts';
import { CarLoader } from '@/components/car-loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const FEATURES = planFeatureKeySchema.options;

type LimitForm = { enabled: boolean; limit: string };
type FormState = {
  code: string;
  name: string;
  description: string;
  priceReais: string;
  billingInterval: 'MONTHLY' | 'YEARLY';
  active: boolean;
  limits: Record<PlanFeatureKey, LimitForm>;
};

function emptyLimits(): Record<PlanFeatureKey, LimitForm> {
  return Object.fromEntries(FEATURES.map((f) => [f, { enabled: true, limit: '' }])) as Record<
    PlanFeatureKey,
    LimitForm
  >;
}

function blankForm(): FormState {
  return {
    code: '',
    name: '',
    description: '',
    priceReais: '0',
    billingInterval: 'MONTHLY',
    active: true,
    limits: emptyLimits(),
  };
}

function formFromPlan(plan: PlanDto): FormState {
  const limits = emptyLimits();
  for (const l of plan.limits) {
    limits[l.feature] = { enabled: l.enabled, limit: l.limit == null ? '' : String(l.limit) };
  }
  return {
    code: plan.code,
    name: plan.name,
    description: plan.description ?? '',
    priceReais: (plan.priceCents / 100).toFixed(2),
    billingInterval: plan.billingInterval,
    active: plan.active,
    limits,
  };
}

/** Resumo curto dos limites de um plano para a listagem. */
function limitLabel(enabled: boolean, limit: number | null): string {
  if (!enabled) return 'bloqueado';
  return limit == null ? 'ilimitado' : String(limit);
}

export default function PlanosPage() {
  const { user } = useAuth();
  const plans = usePlatformPlans();
  const upsert = useUpsertPlan();
  const [form, setForm] = useState<FormState>(blankForm());
  const [editingCode, setEditingCode] = useState<string | null>(null);

  if (!user?.platformAdmin) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <ShieldAlert className="mx-auto mb-3 size-8 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Acesso restrito</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Esta área é exclusiva do administrador da plataforma.
        </p>
      </div>
    );
  }

  function startNew() {
    setForm(blankForm());
    setEditingCode(null);
  }

  function startEdit(plan: PlanDto) {
    setForm(formFromPlan(plan));
    setEditingCode(plan.code);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setLimit(feature: PlanFeatureKey, patch: Partial<LimitForm>) {
    setForm((f) => ({
      ...f,
      limits: { ...f.limits, [feature]: { ...f.limits[feature], ...patch } },
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const input: UpsertPlanInput = {
      code: form.code,
      name: form.name,
      description: form.description.trim() || undefined,
      active: form.active,
      priceCents: Math.round((Number(form.priceReais) || 0) * 100),
      currency: 'BRL',
      billingInterval: form.billingInterval,
      limits: FEATURES.map((feature) => ({
        feature,
        enabled: form.limits[feature].enabled,
        limit: form.limits[feature].limit.trim() === '' ? null : Number(form.limits[feature].limit),
      })),
    };

    const parsed = upsertPlanSchema.safeParse(input);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Confira os campos do plano.');
      return;
    }

    try {
      await upsert.mutateAsync(parsed.data);
      toast.success(editingCode ? 'Plano atualizado' : 'Plano criado');
      startNew();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao salvar o plano');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CreditCard className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Planos</h1>
          <p className="text-sm text-muted-foreground">
            Defina os planos do SaaS e o que cada um libera. Atribua um plano a uma conta na tela de
            Contas.
          </p>
        </div>
      </div>

      {/* Formulário criar/editar */}
      <form onSubmit={onSubmit} className="space-y-5 rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {editingCode ? `Editar plano: ${editingCode}` : 'Novo plano'}
          </h2>
          {editingCode && (
            <Button type="button" variant="outline" size="sm" onClick={startNew}>
              <Plus className="size-4" /> Novo plano
            </Button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="code">Código (identificador)</Label>
            <Input
              id="code"
              value={form.code}
              disabled={!!editingCode}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toLowerCase() }))}
              placeholder="ex.: pro"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="ex.: Pro"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="price">Preço (R$ / período)</Label>
            <Input
              id="price"
              type="number"
              min="0"
              step="0.01"
              value={form.priceReais}
              onChange={(e) => setForm((f) => ({ ...f, priceReais: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="interval">Cobrança</Label>
            <Select
              id="interval"
              value={form.billingInterval}
              onChange={(e) =>
                setForm((f) => ({ ...f, billingInterval: e.target.value as 'MONTHLY' | 'YEARLY' }))
              }
            >
              <option value="MONTHLY">Mensal</option>
              <option value="YEARLY">Anual</option>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Descrição (opcional)</Label>
          <Textarea
            id="description"
            rows={2}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Resumo do plano"
          />
        </div>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
            className="size-4 accent-primary"
          />
          Plano ativo (disponível para atribuição)
        </label>

        {/* Limites por feature */}
        <div className="rounded-lg border">
          <div className="border-b bg-muted/40 px-4 py-2 text-sm font-semibold">
            Limites por recurso
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recurso</TableHead>
                <TableHead className="w-[120px]">Habilitado</TableHead>
                <TableHead className="w-[220px]">Limite (vazio = ilimitado)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {FEATURES.map((feature) => {
                const row = form.limits[feature];
                return (
                  <TableRow key={feature}>
                    <TableCell className="font-medium">{PLAN_FEATURE_LABELS[feature]}</TableCell>
                    <TableCell>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={row.enabled}
                          onChange={(e) => setLimit(feature, { enabled: e.target.checked })}
                          className="size-4 accent-primary"
                        />
                        {row.enabled ? 'Sim' : 'Bloqueado'}
                      </label>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        disabled={!row.enabled}
                        value={row.limit}
                        onChange={(e) => setLimit(feature, { limit: e.target.value })}
                        placeholder="ilimitado"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={upsert.isPending}>
            {upsert.isPending ? 'Salvando…' : editingCode ? 'Salvar alterações' : 'Criar plano'}
          </Button>
        </div>
      </form>

      {/* Lista de planos */}
      <div className="rounded-xl border bg-card">
        <div className="border-b px-6 py-3 text-sm font-semibold">Planos cadastrados</div>
        {plans.isLoading ? (
          <div className="p-10">
            <CarLoader />
          </div>
        ) : !plans.data || plans.data.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Nenhum plano cadastrado ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plano</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Limites</TableHead>
                <TableHead className="w-[100px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.data.map((plan) => {
                const byFeature = new Map(plan.limits.map((l) => [l.feature, l]));
                return (
                  <TableRow key={plan.id}>
                    <TableCell>
                      <div className="font-medium">{plan.name}</div>
                      <div className="text-xs text-muted-foreground">{plan.code}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {plan.priceCents === 0
                        ? 'Grátis'
                        : `R$ ${(plan.priceCents / 100).toFixed(2)}`}
                      <span className="text-xs text-muted-foreground">
                        {plan.billingInterval === 'YEARLY' ? '/ano' : '/mês'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={plan.active ? 'success' : 'secondary'}>
                        {plan.active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {FEATURES.map((feature) => {
                          const l = byFeature.get(feature);
                          const enabled = l?.enabled ?? true;
                          const limit = l?.limit ?? null;
                          return (
                            <span
                              key={feature}
                              className="rounded border bg-muted/40 px-1.5 py-0.5 text-xs text-muted-foreground"
                              title={PLAN_FEATURE_LABELS[feature]}
                            >
                              {PLAN_FEATURE_LABELS[feature]}: {limitLabel(enabled, limit)}
                            </span>
                          );
                        })}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => startEdit(plan)}
                      >
                        <Pencil className="size-4" /> Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
