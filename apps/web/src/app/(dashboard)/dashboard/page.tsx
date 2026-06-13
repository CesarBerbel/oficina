'use client';

import Link from 'next/link';
import {
  ClipboardList,
  Stethoscope,
  FileClock,
  CheckCircle2,
  Wrench,
  PackageCheck,
  AlertTriangle,
  Package,
  ShoppingCart,
  ArrowRight,
  Timer,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { ActionItem, DashboardMetrics } from '@oficina/shared';
import { useAuth } from '@/lib/auth-context';
import {
  useDashboardActions,
  useDashboardMetrics,
  useDashboardProductivity,
} from '@/features/dashboard/use-dashboard';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface MetricDef {
  key: keyof DashboardMetrics;
  label: string;
  icon: LucideIcon;
  link: string;
  tone?: 'default' | 'danger' | 'warning' | 'success';
}

const METRICS: MetricDef[] = [
  { key: 'osOpen', label: 'OS ativas', icon: ClipboardList, link: '/os' },
  { key: 'osDiagnosis', label: 'Diagnóstico pronto', icon: Stethoscope, link: '/os?status=DIAGNOSTICO_PRONTO' },
  { key: 'osAwaitingApproval', label: 'Aguardando aprovação', icon: FileClock, link: '/os?status=ORCAMENTO', tone: 'warning' },
  { key: 'osApproved', label: 'Aprovadas', icon: CheckCircle2, link: '/os?status=ORCAMENTO_APROVADO', tone: 'success' },
  { key: 'osInExecution', label: 'Em execução', icon: Wrench, link: '/os?status=EM_EXECUCAO' },
  { key: 'osReady', label: 'Prontas', icon: PackageCheck, link: '/os?status=PRONTA', tone: 'success' },
  { key: 'osOverdue', label: 'Atrasadas', icon: AlertTriangle, link: '/os', tone: 'danger' },
  { key: 'lowStock', label: 'Estoque baixo', icon: Package, link: '/estoque', tone: 'warning' },
  { key: 'pendingPurchases', label: 'Compras pendentes', icon: ShoppingCart, link: '/compras' },
];

const TONE: Record<string, string> = {
  default: 'bg-primary/10 text-primary',
  danger: 'bg-destructive/10 text-destructive',
  warning: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  success: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
};

const PRIORITY_VARIANT: Record<ActionItem['priority'], BadgeProps['variant']> = {
  alta: 'destructive',
  media: 'warning',
  baixa: 'secondary',
};

export default function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.name?.split(' ')[0] ?? '';
  const { data: metrics } = useDashboardMetrics();
  const { data: actions } = useDashboardActions();
  const { data: productivity } = useDashboardProductivity();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Olá, {firstName} 👋</h1>
        <p className="text-muted-foreground">Visão geral da oficina.</p>
      </div>

      {/* Cards de métricas */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
        {METRICS.map((m) => {
          const Icon = m.icon;
          const value = metrics?.[m.key] ?? 0;
          return (
            <Link key={m.key} href={m.link}>
              <Card className={cn('transition-colors hover:border-primary', value > 0 && m.tone === 'danger' && 'border-destructive/40')}>
                <CardContent className="flex items-center justify-between p-5">
                  <div>
                    <p className="text-sm text-muted-foreground">{m.label}</p>
                    <p className="mt-1 text-3xl font-bold">{value}</p>
                  </div>
                  <span className={cn('flex h-10 w-10 items-center justify-center rounded-lg', TONE[m.tone ?? 'default'])}>
                    <Icon className="size-5" />
                  </span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>


      {/* Produtividade e tempo médio por etapa */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ciclo médio</p>
                <p className="mt-1 text-3xl font-bold">
                  {productivity?.averageCycleHours != null
                    ? `${productivity.averageCycleHours}h`
                    : '—'}
                </p>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Timer className="size-5" />
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              OS entregues nos últimos {productivity?.periodDays ?? 30} dias:{' '}
              <strong>{productivity?.deliveredOrders ?? 0}</strong>
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-primary" />
              <h2 className="font-semibold">Produtividade por técnico</h2>
            </div>
            {!productivity || productivity.technicians.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ainda não há entregas suficientes para calcular produtividade.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {productivity.technicians.slice(0, 4).map((tech) => (
                  <div key={tech.technicianId ?? 'unassigned'} className="rounded-lg border p-3">
                    <p className="truncate text-sm font-medium">{tech.technicianName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {tech.deliveredOrders} entregues · {tech.activeOrders} ativas
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Ciclo médio:{' '}
                      {tech.averageCycleHours != null ? `${tech.averageCycleHours}h` : '—'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-3 p-5">
          <h2 className="font-semibold">Tempo médio por etapa</h2>
          {!productivity || productivity.averageStatusHours.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Os tempos serão calculados conforme a OS passar pelas etapas.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {productivity.averageStatusHours.slice(0, 8).map((status) => (
                <div key={status.status} className="rounded-lg border p-3">
                  <p className="truncate text-sm font-medium">{status.label}</p>
                  <p className="mt-1 text-2xl font-bold">
                    {status.averageHours != null ? `${status.averageHours}h` : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {status.sampleSize} amostra(s)
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Central de ações (resumo) */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Central de ações</h2>
          <Link href="/central-acoes" className="flex items-center gap-1 text-sm text-primary hover:underline">
            Ver tudo <ArrowRight className="size-4" />
          </Link>
        </div>
        {!actions || actions.length === 0 ? (
          <Card>
            <CardContent className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-emerald-600" /> Nenhuma pendência. Tudo em dia!
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {actions.slice(0, 5).map((a) => (
              <Link key={a.key} href={a.link}>
                <Card className="transition-colors hover:border-primary">
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant={PRIORITY_VARIANT[a.priority]}>{a.priority}</Badge>
                        <span className="font-medium">{a.title}</span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{a.count}</span>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">{a.description}</p>
                    </div>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
