'use client';

import { useState } from 'react';
import { CreditCard, ArrowUpCircle, Check } from 'lucide-react';
import { toast } from 'sonner';
import { PLAN_FEATURE_LABELS } from '@oficina/shared';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { CarLoader } from '@/components/car-loader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  useAccountPlans,
  useBillingUsage,
  useRequestPlanUpgrade,
} from '@/features/billing/use-billing';

function fmtLimit(value: number | null): string {
  return value == null ? 'Ilimitado' : value.toLocaleString('pt-BR');
}

function fmtPrice(cents: number, currency: string, interval: 'MONTHLY' | 'YEARLY'): string {
  if (cents === 0) return 'Grátis';
  const value = (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency });
  return `${value} / ${interval === 'YEARLY' ? 'ano' : 'mês'}`;
}

export default function PlanoPage() {
  const { user } = useAuth();
  const { data, isLoading } = useBillingUsage();
  const plans = useAccountPlans();
  const requestUpgrade = useRequestPlanUpgrade();
  const [requested, setRequested] = useState<string | null>(null);

  const canRequest = user?.permissions?.includes('settings:manage') ?? false;

  async function onRequest(planId: string) {
    try {
      await requestUpgrade.mutateAsync(planId);
      setRequested(planId);
      toast.success('Pedido enviado! O administrador da plataforma vai avaliar.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao solicitar o plano');
    }
  }

  if (isLoading) return <CarLoader />;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <CreditCard className="size-6 text-primary" /> Plano e quotas
        </h1>
        <p className="text-muted-foreground">
          Acompanhe o plano atual e o consumo da conta {data.accountName}.
        </p>
      </div>

      <section className="rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">Plano atual</p>
        <h2 className="mt-1 text-xl font-semibold">{data.plan.name ?? 'Sem plano definido'}</h2>
        {data.plan.code && (
          <p className="text-sm text-muted-foreground">Código: {data.plan.code}</p>
        )}
        {data.subscription && (
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Badge variant="secondary">{data.subscription.status}</Badge>
            {data.subscription.currentPeriodEnd && (
              <Badge variant="outline">
                Vigente até{' '}
                {new Date(data.subscription.currentPeriodEnd).toLocaleDateString('pt-BR')}
              </Badge>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card">
        <div className="border-b p-4">
          <h2 className="font-semibold">Uso por feature</h2>
          <p className="text-sm text-muted-foreground">
            Features mensais reiniciam por período; demais limites são calculados em tempo real.
          </p>
        </div>
        <div className="divide-y">
          {data.usage.map((item) => {
            const pct = item.limit ? Math.min(100, Math.round((item.used / item.limit) * 100)) : 0;
            return (
              <div key={item.feature} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{PLAN_FEATURE_LABELS[item.feature]}</p>
                    <p className="text-xs text-muted-foreground">Período: {item.period}</p>
                  </div>
                  <Badge variant={!item.enabled || item.exceeded ? 'destructive' : 'secondary'}>
                    {item.enabled
                      ? `${item.used.toLocaleString('pt-BR')} / ${fmtLimit(item.limit)}`
                      : 'Bloqueado'}
                  </Badge>
                </div>
                {item.limit != null && (
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {(plans.data?.length ?? 0) > 0 && (
        <section className="rounded-xl border bg-card">
          <div className="border-b p-4">
            <h2 className="font-semibold">Planos disponíveis</h2>
            <p className="text-sm text-muted-foreground">
              Para mudar de plano, solicite o upgrade — o administrador da plataforma confirma a
              troca.
            </p>
          </div>
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {plans.data!.map((plan) => {
              const isCurrent = plan.id === data.plan.id;
              const wasRequested = requested === plan.id;
              return (
                <div key={plan.id} className="flex flex-col rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{plan.name}</p>
                      <p className="text-xs text-muted-foreground">{plan.code}</p>
                    </div>
                    {isCurrent && <Badge variant="success">Atual</Badge>}
                  </div>
                  <p className="mt-2 text-sm font-medium">
                    {fmtPrice(plan.priceCents, plan.currency, plan.billingInterval)}
                  </p>
                  <ul className="mt-3 flex-1 space-y-1 text-xs text-muted-foreground">
                    {plan.limits.map((l) => (
                      <li key={l.feature}>
                        {PLAN_FEATURE_LABELS[l.feature]}:{' '}
                        {!l.enabled ? 'bloqueado' : l.limit == null ? 'ilimitado' : l.limit}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4">
                    {isCurrent ? (
                      <Button variant="outline" className="w-full" disabled>
                        Plano atual
                      </Button>
                    ) : wasRequested ? (
                      <Button variant="outline" className="w-full" disabled>
                        <Check className="size-4" /> Pedido enviado
                      </Button>
                    ) : (
                      <Button
                        className="w-full"
                        disabled={!canRequest || requestUpgrade.isPending}
                        onClick={() => onRequest(plan.id)}
                        title={canRequest ? undefined : 'Só o administrador pode solicitar'}
                      >
                        <ArrowUpCircle className="size-4" /> Solicitar este plano
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
