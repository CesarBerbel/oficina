'use client';

import { useState } from 'react';
import {
  CreditCard,
  Plus,
  Pencil,
  ShieldAlert,
  Users,
  Store,
  Wrench,
  Upload,
  Database,
  Sparkles,
  MessageSquare,
  Globe,
  type LucideIcon,
} from 'lucide-react';
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

const FEATURES = planFeatureKeySchema.options;

const FEATURE_ICONS: Record<PlanFeatureKey, LucideIcon> = {
  USERS: Users,
  BRANCHES: Store,
  SERVICE_ORDERS_MONTH: Wrench,
  UPLOADS_MONTH: Upload,
  STORAGE_MB: Database,
  AI_MONTH: Sparkles,
  MESSAGES_MONTH: MessageSquare,
  CUSTOM_DOMAINS: Globe,
};

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

/** Resumo curto de um limite para os cartões de planos. */
function limitLabel(enabled: boolean, limit: number | null): string {
  if (!enabled) return 'Bloqueado';
  return limit == null ? 'Ilimitado' : String(limit);
}

function formatPrice(priceCents: number): string {
  return priceCents === 0 ? 'Grátis' : `R$ ${(priceCents / 100).toFixed(2)}`;
}

/** Interruptor (on/off) reutilizável. */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-primary' : 'bg-input'
      }`}
    >
      <span
        className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
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
      <form onSubmit={onSubmit} className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {editingCode ? <Pencil className="size-4" /> : <Plus className="size-4" />}
            </span>
            <div>
              <h2 className="text-base font-semibold leading-tight">
                {editingCode ? 'Editar plano' : 'Novo plano'}
              </h2>
              {editingCode && (
                <span className="text-xs text-muted-foreground">Código: {editingCode}</span>
              )}
            </div>
          </div>
          {editingCode && (
            <Button type="button" variant="outline" size="sm" onClick={startNew}>
              <Plus className="size-4" /> Novo plano
            </Button>
          )}
        </div>

        <div className="space-y-6 p-6">
          {/* Identificação */}
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
                  setForm((f) => ({
                    ...f,
                    billingInterval: e.target.value as 'MONTHLY' | 'YEARLY',
                  }))
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

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Plano ativo</p>
              <p className="text-xs text-muted-foreground">Disponível para atribuição às contas</p>
            </div>
            <Toggle
              checked={form.active}
              onChange={(v) => setForm((f) => ({ ...f, active: v }))}
              label="Plano ativo"
            />
          </div>

          {/* Limites por recurso */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Limites por recurso</h3>
              <span className="text-xs text-muted-foreground">Campo vazio = ilimitado</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {FEATURES.map((feature) => {
                const row = form.limits[feature];
                const Icon = FEATURE_ICONS[feature];
                return (
                  <div
                    key={feature}
                    className={`rounded-lg border p-3 transition-colors ${
                      row.enabled ? 'bg-card' : 'bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={`flex size-7 shrink-0 items-center justify-center rounded-md ${
                            row.enabled
                              ? 'bg-primary/10 text-primary'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          <Icon className="size-4" />
                        </span>
                        <span className="truncate text-sm font-medium">
                          {PLAN_FEATURE_LABELS[feature]}
                        </span>
                      </div>
                      <Toggle
                        checked={row.enabled}
                        onChange={(v) => setLimit(feature, { enabled: v })}
                        label={`Habilitar ${PLAN_FEATURE_LABELS[feature]}`}
                      />
                    </div>
                    <div className="mt-2.5">
                      {row.enabled ? (
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={row.limit}
                          onChange={(e) => setLimit(feature, { limit: e.target.value })}
                          placeholder="Ilimitado"
                          className="h-9"
                        />
                      ) : (
                        <p className="flex h-9 items-center text-xs text-muted-foreground">
                          Recurso bloqueado neste plano
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={upsert.isPending}>
              {upsert.isPending ? (
                <>
                  <CarLoader className="size-4 animate-spin" /> Salvando…
                </>
              ) : editingCode ? (
                'Salvar alterações'
              ) : (
                'Criar plano'
              )}
            </Button>
          </div>
        </div>
      </form>

      {/* Lista de planos */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Planos cadastrados</h2>
          {!!plans.data?.length && <Badge variant="secondary">{plans.data.length}</Badge>}
        </div>

        {plans.isLoading ? (
          <div className="rounded-xl border bg-card p-10">
            <CarLoader />
          </div>
        ) : !plans.data || plans.data.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-10 text-center">
            <CreditCard className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nenhum plano cadastrado ainda. Crie o primeiro no formulário acima.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.data.map((plan) => {
              const byFeature = new Map(plan.limits.map((l) => [l.feature, l]));
              const isEditing = editingCode === plan.code;
              return (
                <div
                  key={plan.id}
                  className={`flex flex-col rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md ${
                    isEditing ? 'ring-2 ring-primary' : ''
                  } ${plan.active ? '' : 'opacity-75'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-lg font-semibold leading-tight">
                        {plan.name}
                      </div>
                      <div className="text-xs text-muted-foreground">{plan.code}</div>
                    </div>
                    <Badge variant={plan.active ? 'success' : 'secondary'}>
                      {plan.active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>

                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-2xl font-bold tabular-nums">
                      {formatPrice(plan.priceCents)}
                    </span>
                    {plan.priceCents > 0 && (
                      <span className="text-sm text-muted-foreground">
                        {plan.billingInterval === 'YEARLY' ? '/ano' : '/mês'}
                      </span>
                    )}
                  </div>

                  {plan.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {plan.description}
                    </p>
                  )}

                  <ul className="mt-4 space-y-2 border-t pt-4 text-sm">
                    {FEATURES.map((feature) => {
                      const l = byFeature.get(feature);
                      const enabled = l?.enabled ?? true;
                      const limit = l?.limit ?? null;
                      const Icon = FEATURE_ICONS[feature];
                      return (
                        <li key={feature} className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                            <Icon className="size-3.5 shrink-0" />
                            <span className="truncate">{PLAN_FEATURE_LABELS[feature]}</span>
                          </span>
                          <span
                            className={`shrink-0 font-medium tabular-nums ${
                              !enabled
                                ? 'text-muted-foreground/60 line-through'
                                : limit == null
                                  ? 'text-primary'
                                  : ''
                            }`}
                          >
                            {limitLabel(enabled, limit)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-4 w-full"
                    onClick={() => startEdit(plan)}
                  >
                    <Pencil className="size-4" /> Editar
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
