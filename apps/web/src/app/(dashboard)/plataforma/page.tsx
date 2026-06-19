'use client';

import Link from 'next/link';
import { LayoutDashboard, Store, Building2, Clock, ShieldAlert, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { usePlatformOverview } from '@/features/platform/use-accounts';
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
      </div>

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
    </div>
  );
}
