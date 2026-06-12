'use client';

import { DollarSign, PackageCheck, Receipt } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import type { NamedTotal } from '@oficina/shared';
import { useReports } from '@/features/settings/use-settings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';

export default function ReportsPage() {
  const { data, isLoading } = useReports();

  if (isLoading || !data) {
    return <div className="grid h-64 place-items-center"><CarLoader className="size-6 animate-spin text-muted-foreground" /></div>;
  }

  const maxMonth = Math.max(1, ...data.revenueByMonth.map((m) => m.total));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
        <p className="text-muted-foreground">Visão operacional e financeira.</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi icon={DollarSign} label="Faturamento (aprovado)" value={formatCurrency(data.revenueTotal)} />
        <Kpi icon={PackageCheck} label="OS entregues" value={String(data.deliveredCount)} />
        <Kpi icon={Receipt} label="Ticket médio" value={formatCurrency(data.averageTicket)} />
      </div>

      {/* Faturamento por mês */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Faturamento por mês</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {data.revenueByMonth.map((m) => (
            <div key={m.month} className="flex items-center gap-3 text-sm">
              <span className="w-16 text-muted-foreground">{m.month}</span>
              <div className="h-5 flex-1 rounded bg-muted">
                <div className="h-5 rounded bg-primary" style={{ width: `${(m.total / maxMonth) * 100}%` }} />
              </div>
              <span className="w-24 text-right tabular-nums">{formatCurrency(m.total)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* OS por status */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">OS por status</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {data.osByStatus.length === 0 ? <p className="text-muted-foreground">—</p> : data.osByStatus.map((s) => (
              <div key={s.status} className="flex justify-between">
                <span className="text-muted-foreground">{s.label}</span>
                <span className="font-medium">{s.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <RankCard title="Top serviços (R$)" items={data.topServices} format={(v) => formatCurrency(v)} />
        <RankCard title="Top peças (qtd)" items={data.topParts} format={(v) => String(v)} />
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: typeof DollarSign; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5" /></span>
      </CardContent>
    </Card>
  );
}

function RankCard({ title, items, format }: { title: string; items: NamedTotal[]; format: (v: number) => string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-1.5 text-sm">
        {items.length === 0 ? <p className="text-muted-foreground">Sem dados.</p> : items.map((i, idx) => (
          <div key={idx} className="flex justify-between gap-2">
            <span className="truncate text-muted-foreground">{i.name}</span>
            <span className="shrink-0 font-medium">{format(i.value)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
