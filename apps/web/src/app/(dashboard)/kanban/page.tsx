'use client';

import Link from 'next/link';
import { Loader2, AlertTriangle } from 'lucide-react';
import type { ServiceOrderStatus, ServiceOrderSummaryDto } from '@oficina/shared';
import { useServiceOrderBoard } from '@/features/service-orders/use-service-orders';

const COLUMNS: { label: string; statuses: ServiceOrderStatus[] }[] = [
  { label: 'Aguardando diagnóstico', statuses: ['ENTRADA'] },
  { label: 'Em orçamento', statuses: ['DIAGNOSTICO_PRONTO', 'ORCAMENTO'] },
  { label: 'Aprovada', statuses: ['ORCAMENTO_APROVADO'] },
  { label: 'Em execução', statuses: ['EM_EXECUCAO'] },
  { label: 'Em teste', statuses: ['EM_TESTE'] },
  { label: 'Pronta', statuses: ['PRONTA', 'PRONTO_RETIRAR'] },
];

export default function KanbanPage() {
  const { data, isLoading } = useServiceOrderBoard();

  function ordersFor(statuses: ServiceOrderStatus[]): ServiceOrderSummaryDto[] {
    if (!data) return [];
    return statuses.flatMap((s) => data[s] ?? []);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Kanban técnico</h1>
        <p className="text-muted-foreground">Fluxo das OS em andamento.</p>
      </div>

      {isLoading ? (
        <div className="grid h-64 place-items-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((col) => {
            const orders = ordersFor(col.statuses);
            return (
              <div key={col.label} className="flex w-72 shrink-0 flex-col">
                <div className="mb-3 flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold">{col.label}</h2>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {orders.length}
                  </span>
                </div>
                <div className="flex-1 space-y-2 rounded-xl bg-muted/40 p-2">
                  {orders.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">
                      Vazio
                    </p>
                  ) : (
                    orders.map((o) => (
                      <Link
                        key={o.id}
                        href={`/os/${o.id}?returnTo=${encodeURIComponent('/kanban')}`}
                        className="block rounded-lg border bg-card p-3 shadow-sm transition-colors hover:border-primary"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold">#{o.number}</span>
                          {o.isOverdue && (
                            <AlertTriangle className="size-3.5 text-destructive" />
                          )}
                        </div>
                        <p className="truncate text-sm font-medium">{o.customerName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {o.vehicleLabel} · {o.vehiclePlate}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {o.technicianName ?? 'Sem técnico'}
                        </p>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
