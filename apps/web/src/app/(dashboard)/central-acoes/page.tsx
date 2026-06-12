'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, Clock } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import type { ActionItem } from '@oficina/shared';
import { useDashboardActions } from '@/features/dashboard/use-dashboard';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, type BadgeProps } from '@/components/ui/badge';

const PRIORITY_VARIANT: Record<ActionItem['priority'], BadgeProps['variant']> = {
  alta: 'destructive',
  media: 'warning',
  baixa: 'secondary',
};

function ageLabel(hours: number | null): string | null {
  if (hours == null) return null;
  if (hours < 1) return 'há poucos minutos';
  if (hours < 24) return `há ${hours}h`;
  const days = Math.round(hours / 24);
  return `há ${days} dia${days > 1 ? 's' : ''}`;
}

export default function CentralAcoesPage() {
  const { data: actions, isLoading } = useDashboardActions();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Central de ações</h1>
        <p className="text-muted-foreground">Pendências operacionais que precisam de atenção.</p>
      </div>

      {isLoading ? (
        <div className="grid h-40 place-items-center">
          <CarLoader className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : !actions || actions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
            <CheckCircle2 className="size-8 text-emerald-600" />
            <p className="font-medium text-foreground">Tudo em dia!</p>
            <p className="text-sm">Nenhuma pendência operacional no momento.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {actions.map((a) => {
            const age = ageLabel(a.ageHours);
            return (
              <Link key={a.key} href={a.link}>
                <Card className="transition-colors hover:border-primary">
                  <CardContent className="flex items-center justify-between gap-4 p-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={PRIORITY_VARIANT[a.priority]}>{a.priority}</Badge>
                        <span className="font-medium">{a.title}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {a.count}
                        </span>
                        {age && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="size-3" /> {age}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>
                    </div>
                    <ArrowRight className="size-5 shrink-0 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
