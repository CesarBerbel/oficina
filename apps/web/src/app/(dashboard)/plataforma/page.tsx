'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  Clock,
  LayoutDashboard,
  MonitorSmartphone,
  ShieldAlert,
  Store,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import {
  usePlatformOverview,
  usePlatformPlans,
  usePlatformSessions,
} from '@/features/platform/use-accounts';
import { CarLoader } from '@/components/car-loader';

function Stat({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  tone?: string;
  icon: typeof Store;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <p className={`mt-1 text-2xl font-bold tracking-tight ${tone ?? ''}`}>{value}</p>
    </div>
  );
}

export default function PlataformaPage() {
  const { user } = useAuth();
  const { data, isLoading } = usePlatformOverview();
  const { data: sessions = [] } = usePlatformSessions();
  const { data: plans = [] } = usePlatformPlans();

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

  if (isLoading || !data)
    return <CarLoader className="size-6 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <LayoutDashboard className="size-6 text-primary" /> Painel da plataforma
          </h1>
          <p className="text-muted-foreground">Visão geral das oficinas e contas do SaaS.</p>
        </div>
        <Link
          href="/contas"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Gerenciar contas <ArrowRight className="size-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Contas ativas"
          value={data.accounts.active}
          tone="text-emerald-600"
          icon={Store}
        />
        <Stat label="Oficinas" value={data.oficinas} icon={Building2} />
        <Stat
          label="Pedidos pendentes"
          value={data.pendingRequests}
          tone={data.pendingRequests > 0 ? 'text-amber-600' : ''}
          icon={Clock}
        />
        <Stat
          label="Suspensas"
          value={data.accounts.suspended}
          tone={data.accounts.suspended > 0 ? 'text-destructive' : ''}
          icon={Store}
        />
        <Stat label="Total de contas" value={data.accounts.total} icon={Store} />
        <Stat label="Sessões ativas" value={sessions.length} icon={MonitorSmartphone} />
      </div>

      <section className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Planos SaaS</h2>
            <p className="text-sm text-muted-foreground">
              Planos ativos e quotas por feature. A atribuição por conta fica em /contas.
            </p>
          </div>
          <Link href="/contas" className="text-sm font-medium text-primary hover:underline">
            Atribuir planos
          </Link>
        </div>
        {plans.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum plano cadastrado.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => (
              <div key={plan.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{plan.name}</p>
                    <p className="text-xs text-muted-foreground">{plan.code}</p>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {plan.active ? 'ativo' : 'inativo'}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium">
                  {(plan.priceCents / 100).toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: plan.currency,
                  })}
                  <span className="text-xs font-normal text-muted-foreground">
                    {' '}
                    / {plan.billingInterval === 'YEARLY' ? 'ano' : 'mês'}
                  </span>
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {plan.limits.length} limite(s) configurado(s)
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {data.pendingRequests > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm text-amber-700">
            Há {data.pendingRequests} pedido(s) de oficina aguardando aprovação.
          </p>
          <Link
            href="/contas"
            className="inline-flex items-center gap-1 text-sm font-semibold text-amber-700 hover:underline"
          >
            Revisar <ArrowRight className="size-4" />
          </Link>
        </div>
      )}

      <Link
        href="/sessoes"
        className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 hover:bg-accent"
      >
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <MonitorSmartphone className="size-5 text-primary" /> Sessões ativas
          </h2>
          <p className="text-sm text-muted-foreground">
            {sessions.length} sessão(ões) ativa(s) nas oficinas. Gerencie (revogar/encerrar) na tela
            dedicada.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
          Gerenciar <ArrowRight className="size-4" />
        </span>
      </Link>
    </div>
  );
}
