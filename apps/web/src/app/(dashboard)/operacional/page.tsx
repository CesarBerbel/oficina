'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, CalendarClock, ClipboardList, Users } from 'lucide-react';
import { useOperationalDashboard } from '@/features/operational/use-operational';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const PRIORITY: Record<string, BadgeProps['variant']> = {
  alta: 'destructive',
  media: 'warning',
  baixa: 'secondary',
};

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function formatAge(minutes: number | null): string {
  if (minutes == null) return '—';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.round(minutes / 60)}h`;
}

export default function OperacionalPage() {
  const { data, isLoading } = useOperationalDashboard();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard operacional</h1>
          <p className="text-muted-foreground">O que exige atenção hoje na Recepção e na oficina.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/configuracoes/operacional">Configurar regras</Link>
        </Button>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Carregando operação...</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(data?.kpis ?? []).map((kpi) => (
          <Link key={kpi.key} href={kpi.href}>
            <Card className="h-full transition-colors hover:border-primary">
              <CardContent className="flex items-start justify-between gap-4 p-5">
                <div>
                  <p className="text-sm text-muted-foreground">{kpi.label}</p>
                  <p className="mt-1 text-3xl font-bold">{kpi.value}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{kpi.description}</p>
                </div>
                <Badge variant={PRIORITY[kpi.priority] ?? 'secondary'}>{kpi.priority}</Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center gap-2">
              <CalendarClock className="size-5 text-primary" />
              <div>
                <h2 className="font-semibold">Próximas chegadas</h2>
                <p className="text-sm text-muted-foreground">Agenda dentro da janela configurada.</p>
              </div>
            </div>
            <div className="space-y-2">
              {(data?.upcomingArrivals ?? []).length === 0 ? (
                <p className="rounded-lg border p-4 text-sm text-muted-foreground">Nenhuma chegada próxima.</p>
              ) : (
                data!.upcomingArrivals.map((item) => (
                  <Link key={item.id} href={item.href} className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent">
                    <div>
                      <p className="font-medium">{item.customerName}</p>
                      <p className="text-sm text-muted-foreground">{item.vehicleLabel ?? 'Veículo não informado'} · {item.serviceType ?? 'Serviço não informado'}</p>
                    </div>
                    <div className="text-right text-sm">
                      <p>{formatDateTime(item.startAt)}</p>
                      <p className="text-muted-foreground">{item.status}</p>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-primary" />
              <div>
                <h2 className="font-semibold">Alertas operacionais</h2>
                <p className="text-sm text-muted-foreground">Prioridades calculadas pelas regras configuráveis.</p>
              </div>
            </div>
            <div className="space-y-2">
              {(data?.alerts ?? []).length === 0 ? (
                <p className="rounded-lg border p-4 text-sm text-muted-foreground">Nenhum alerta operacional ativo.</p>
              ) : (
                data!.alerts.map((alert) => (
                  <Link key={alert.id} href={alert.href} className="block rounded-lg border p-3 hover:bg-accent">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{alert.title}</p>
                        <p className="text-sm text-muted-foreground">{alert.description}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant={PRIORITY[alert.priority] ?? 'secondary'}>{alert.priority}</Badge>
                        <span className="text-xs text-muted-foreground">{formatAge(alert.ageMinutes)}</span>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-3 p-5">
            <span className="rounded-lg bg-primary/10 p-3 text-primary"><Users className="size-5" /></span>
            <div>
              <p className="font-medium">Recepção primeiro</p>
              <p className="text-sm text-muted-foreground">Clientes aguardando e chegadas próximas ficam em destaque.</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-5">
            <span className="rounded-lg bg-primary/10 p-3 text-primary"><ClipboardList className="size-5" /></span>
            <div>
              <p className="font-medium">Oficina sem gargalos</p>
              <p className="text-sm text-muted-foreground">OS paradas e aprovações vencidas aparecem antes que virem problema.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
