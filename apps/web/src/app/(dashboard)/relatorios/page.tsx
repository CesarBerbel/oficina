'use client';

import { useState } from 'react';
import {
  BarChart3,
  DollarSign,
  Gauge,
  PackageCheck,
  Receipt,
  TrendingUp,
} from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import type { NamedTotal } from '@oficina/shared';
import { useReports } from '@/features/settings/use-settings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';

const PERIODS = [
  { label: '30 dias', value: 30 },
  { label: '90 dias', value: 90 },
  { label: '180 dias', value: 180 },
  { label: '365 dias', value: 365 },
];

export default function ReportsPage() {
  const [periodDays, setPeriodDays] = useState(180);
  const { data, isLoading } = useReports(periodDays);

  if (isLoading || !data) {
    return <div className="grid h-64 place-items-center"><CarLoader className="size-6 animate-spin text-muted-foreground" /></div>;
  }

  const maxMonth = Math.max(1, ...data.revenueByMonth.map((m) => m.total));
  const maxDay = Math.max(1, ...data.dailyRevenue.map((m) => m.total));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Relatórios gerenciais</h1>
          <p className="text-muted-foreground">
            Faturamento, margem estimada, funil da recepção, produtividade comercial e ranking operacional.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((period) => (
            <Button
              key={period.value}
              size="sm"
              variant={periodDays === period.value ? 'default' : 'outline'}
              onClick={() => setPeriodDays(period.value)}
            >
              {period.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={DollarSign} label="Faturamento" value={formatCurrency(data.revenueTotal)} />
        <Kpi icon={TrendingUp} label="Lucro bruto estimado" value={formatCurrency(data.grossProfit)} />
        <Kpi icon={Gauge} label="Margem bruta" value={`${data.grossMargin}%`} />
        <Kpi icon={Receipt} label="Ticket médio" value={formatCurrency(data.averageTicket)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={PackageCheck} label="OS entregues" value={String(data.deliveredCount)} tone="success" />
        <Kpi icon={BarChart3} label="OS abertas" value={String(data.openedOrders)} />
        <Kpi icon={Gauge} label="Taxa de aprovação" value={`${data.approvalRate}%`} tone="warning" />
        <Kpi icon={TrendingUp} label="Conversão de leads" value={`${data.conversionRate}%`} tone="success" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <BarCard title="Faturamento por mês" items={data.revenueByMonth} max={maxMonth} currency />
        <BarCard title="Faturamento diário — últimos 30 dias" items={data.dailyRevenue} max={maxDay} currency compact />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <StatusCard title="OS por status" items={data.osByStatus} />
        <StatusCard title="Funil da Recepção" items={data.leadFunnel} />
        <CostCard servicesCost={data.servicesCost} partsCost={data.partsCost} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
        <RankCard title="Top serviços (R$)" items={data.topServices} format={(v) => formatCurrency(v)} />
        <RankCard title="Top peças (qtd)" items={data.topParts} format={(v) => String(v)} />
        <RankCard title="Faturamento por técnico" items={data.revenueByTechnician} format={(v) => formatCurrency(v)} />
        <RankCard title="Clientes por faturamento" items={data.revenueByCustomer} format={(v) => formatCurrency(v)} />
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  tone?: 'default' | 'warning' | 'success';
}) {
  const toneClass = {
    default: 'bg-primary/10 text-primary',
    warning: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    success: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  }[tone];

  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneClass}`}><Icon className="size-5" /></span>
      </CardContent>
    </Card>
  );
}

function BarCard({
  title,
  items,
  max,
  currency,
  compact,
}: {
  title: string;
  items: { month: string; total: number }[];
  max: number;
  currency?: boolean;
  compact?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {items.map((m) => (
          <div key={m.month} className="flex items-center gap-3 text-sm">
            <span className={compact ? 'w-20 text-muted-foreground' : 'w-16 text-muted-foreground'}>{compact ? m.month.slice(5) : m.month}</span>
            <div className="h-5 flex-1 rounded bg-muted">
              <div className="h-5 rounded bg-primary" style={{ width: `${(m.total / max) * 100}%` }} />
            </div>
            <span className="w-24 text-right tabular-nums">{currency ? formatCurrency(m.total) : m.total}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function StatusCard({ title, items }: { title: string; items: { status: string; label: string; count: number }[] }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-1.5 text-sm">
        {items.length === 0 ? <p className="text-muted-foreground">Sem dados.</p> : items.map((s) => (
          <div key={s.status} className="flex justify-between gap-3">
            <span className="truncate text-muted-foreground">{s.label}</span>
            <span className="font-medium">{s.count}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function CostCard({ servicesCost, partsCost }: { servicesCost: number; partsCost: number }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Custos estimados</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Mão de obra/catálogo</span>
          <span className="font-medium">{formatCurrency(servicesCost)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Peças consumidas</span>
          <span className="font-medium">{formatCurrency(partsCost)}</span>
        </div>
        <p className="pt-2 text-xs text-muted-foreground">
          Estimativa baseada no custo cadastrado de serviços e peças vinculados aos itens da OS.
        </p>
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
