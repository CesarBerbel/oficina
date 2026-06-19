'use client';

import { CreditCard } from 'lucide-react';
import { PLAN_FEATURE_LABELS } from '@oficina/shared';
import { CarLoader } from '@/components/car-loader';
import { Badge } from '@/components/ui/badge';
import { useBillingUsage } from '@/features/billing/use-billing';

function fmtLimit(value: number | null): string {
  return value == null ? 'Ilimitado' : value.toLocaleString('pt-BR');
}

export default function PlanoPage() {
  const { data, isLoading } = useBillingUsage();
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
    </div>
  );
}
