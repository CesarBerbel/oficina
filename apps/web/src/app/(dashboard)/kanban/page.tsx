'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { CarLoader } from '@/components/car-loader';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import {
  SERVICE_ORDER_STATUS_LABELS,
  type ServiceOrderBoardItemDto,
  type ServiceOrderStatus,
  type ServiceOrderTransitionDto,
} from '@oficina/shared';
import {
  useChangeStatus,
  useServiceOrderBoard,
} from '@/features/service-orders/use-service-orders';
import { StatusBadge } from '@/features/service-orders/status-badge';

const COLUMNS: { label: string; statuses: ServiceOrderStatus[] }[] = [
  { label: 'Entrada / diagnóstico', statuses: ['ENTRADA'] },
  { label: 'Em orçamento', statuses: ['DIAGNOSTICO_PRONTO', 'ORCAMENTO'] },
  { label: 'Aguardando peça', statuses: ['AGUARDANDO_PECA'] },
  { label: 'Aprovada', statuses: ['ORCAMENTO_APROVADO'] },
  { label: 'Em execução', statuses: ['EM_EXECUCAO'] },
  { label: 'Em teste', statuses: ['EM_TESTE'] },
  { label: 'Pronta / retirada', statuses: ['PRONTA', 'PRONTO_RETIRAR'] },
];

const HIDDEN_BOARD_STATUSES: ServiceOrderStatus[] = [
  'ORCAMENTO_RECUSADO',
  'CANCELADA',
  'ENTREGUE',
];

const HIDDEN_QUICK_ACTION_STATUSES: ServiceOrderStatus[] = ['CANCELADA'];

export default function KanbanPage() {
  const { data, isLoading } = useServiceOrderBoard();
  const { hasPermission } = useAuth();
  const canChangeStatus = hasPermission('os:status');
  const [selectedColumnIndex, setSelectedColumnIndex] = useState(0);
  const [draggedOrderId, setDraggedOrderId] = useState<string | null>(null);
  const qc = useQueryClient();

  function allOrders(): ServiceOrderBoardItemDto[] {
    if (!data) return [];
    return Object.values(data).flat().filter(
      (order) => !HIDDEN_BOARD_STATUSES.includes(order.status),
    );
  }

  function ordersFor(statuses: ServiceOrderStatus[]): ServiceOrderBoardItemDto[] {
    if (!data) return [];
    return statuses
      .flatMap((status) => data[status] ?? [])
      .filter((order) => !HIDDEN_BOARD_STATUSES.includes(order.status));
  }

  const selectedColumn = COLUMNS[selectedColumnIndex] ?? COLUMNS[0];

  async function moveDraggedOrderTo(statuses: ServiceOrderStatus[]) {
    if (!draggedOrderId || !canChangeStatus) return;
    const order = allOrders().find((item) => item.id === draggedOrderId);
    if (!order) return;
    const transition = order.availableTransitions.find(
      (item) =>
        statuses.includes(item.status) &&
        !item.disabledReason &&
        !HIDDEN_QUICK_ACTION_STATUSES.includes(item.status),
    );
    if (!transition) {
      toast.error('Esta OS não possui transição rápida para esta coluna.');
      return;
    }
    try {
      await api.post(`/service-orders/${order.id}/status`, {
        status: transition.status,
      });
      await qc.invalidateQueries({ queryKey: ['service-orders'] });
      toast.success(
        `OS #${order.number}: ${SERVICE_ORDER_STATUS_LABELS[transition.status]}`,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Transição inválida');
    } finally {
      setDraggedOrderId(null);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-6rem)] min-h-0 flex-col overflow-hidden sm:h-[calc(100dvh-7rem)]">
      <div className="mb-4 shrink-0 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Kanban técnico
            </h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Fluxo das OS em andamento. A página não gera rolagem própria: se
              uma coluna tiver muitas OS, a rolagem fica somente dentro dela.
            </p>
          </div>
          <div className="rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground">
            OS canceladas, entregues e recusadas ficam fora do quadro técnico.
          </div>
        </div>

        <div className="lg:hidden">
          <label
            htmlFor="kanban-column"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Coluna exibida
          </label>
          <select
            id="kanban-column"
            value={selectedColumnIndex}
            onChange={(event) =>
              setSelectedColumnIndex(Number(event.target.value))
            }
            className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            {COLUMNS.map((column, index) => (
              <option key={column.label} value={index}>
                {column.label} ({ordersFor(column.statuses).length})
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid min-h-0 flex-1 place-items-center overflow-hidden rounded-xl border bg-muted/30">
          <CarLoader className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="hidden min-h-0 flex-1 grid-cols-7 gap-3 overflow-hidden lg:grid">
            {COLUMNS.map((column) => (
              <KanbanColumn
                key={column.label}
                label={column.label}
                orders={ordersFor(column.statuses)}
                canChangeStatus={canChangeStatus}
                dragging={!!draggedOrderId}
                onDropOrder={() => moveDraggedOrderTo(column.statuses)}
                onDragOrder={setDraggedOrderId}
              />
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-hidden lg:hidden">
            <KanbanColumn
              label={selectedColumn.label}
              orders={ordersFor(selectedColumn.statuses)}
              canChangeStatus={canChangeStatus}
              dragging={!!draggedOrderId}
              onDropOrder={() => moveDraggedOrderTo(selectedColumn.statuses)}
              onDragOrder={setDraggedOrderId}
              className="h-full"
            />
          </div>
        </>
      )}
    </div>
  );
}

function KanbanColumn({
  label,
  orders,
  canChangeStatus,
  dragging,
  onDropOrder,
  onDragOrder,
  className,
}: {
  label: string;
  orders: ServiceOrderBoardItemDto[];
  canChangeStatus: boolean;
  dragging: boolean;
  onDropOrder: () => void;
  onDragOrder: (id: string | null) => void;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-xl border bg-muted/30 transition-colors',
        dragging && 'border-dashed border-primary/60 bg-primary/5',
        className,
      )}
      onDragOver={(event) => {
        if (!canChangeStatus) return;
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDropOrder();
      }}
    >
      <header className="shrink-0 border-b bg-card/80 px-3 py-2">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <h2 className="truncate text-sm font-semibold" title={label}>
            {label}
          </h2>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {orders.length}
          </span>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden p-2">
        {orders.length === 0 ? (
          <div className="grid h-full min-h-24 place-items-center rounded-lg border border-dashed bg-background/50 px-3 text-center text-xs text-muted-foreground">
            Vazio
          </div>
        ) : (
          orders.map((order) => (
            <KanbanOrderCard
              key={order.id}
              order={order}
              canChangeStatus={canChangeStatus}
              onDragOrder={onDragOrder}
            />
          ))
        )}
      </div>
    </section>
  );
}

function KanbanOrderCard({
  order,
  canChangeStatus,
  onDragOrder,
}: {
  order: ServiceOrderBoardItemDto;
  canChangeStatus: boolean;
  onDragOrder: (id: string | null) => void;
}) {
  const changeStatus = useChangeStatus(order.id);
  const confirm = useConfirm();
  const enabledTransitions = order.availableTransitions.filter(
    (transition) =>
      !transition.disabledReason &&
      !HIDDEN_QUICK_ACTION_STATUSES.includes(transition.status),
  );

  async function moveTo(transition: ServiceOrderTransitionDto) {
    if (transition.disabledReason) {
      toast.error(transition.disabledReason);
      return;
    }
    if (transition.requiresConfirmation) {
      const ok = await confirm({
        title: transition.label,
        description: transition.description,
        destructive: transition.destructive,
        confirmLabel: transition.label,
      });
      if (!ok) return;
    }

    try {
      await changeStatus.mutateAsync({ status: transition.status });
      toast.success(
        `OS #${order.number}: ${SERVICE_ORDER_STATUS_LABELS[transition.status]}`,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Transição inválida');
    }
  }

  return (
    <div
      className="min-w-0 overflow-hidden rounded-lg border bg-card p-3 shadow-sm transition-colors hover:border-primary"
      draggable={canChangeStatus}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', order.id);
        onDragOrder(order.id);
      }}
      onDragEnd={() => onDragOrder(null)}
    >
      <Link
        href={`/os/${order.id}/tecnico?returnTo=${encodeURIComponent('/kanban')}`}
        className="block min-w-0 space-y-1"
      >
        <div className="flex min-w-0 items-start justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-semibold">
            #{order.number}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            {order.isOverdue && (
              <AlertTriangle className="size-3.5 text-destructive" />
            )}
            <StatusBadge status={order.status} />
          </div>
        </div>
        <p className="truncate text-sm font-medium">{order.customerName}</p>
        <p className="truncate text-xs text-muted-foreground">
          {order.vehicleLabel} · {order.vehiclePlate}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {order.technicianName ?? 'Sem técnico'}
        </p>
      </Link>

      {canChangeStatus && (
        <div className="mt-3 border-t pt-3">
          {enabledTransitions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Sem ação rápida disponível.
            </p>
          ) : (
            <div className="grid gap-1.5">
              {enabledTransitions.map((transition) => (
                <Button
                  key={transition.status}
                  type="button"
                  size="sm"
                  variant={transition.destructive ? 'destructive' : 'secondary'}
                  className="h-auto min-h-8 w-full justify-start gap-1.5 px-2 py-1.5 text-left text-xs leading-tight"
                  disabled={changeStatus.isPending}
                  title={transition.description}
                  onClick={() => moveTo(transition)}
                >
                  {transition.destructive ? (
                    <XCircle className="size-3.5 shrink-0" />
                  ) : (
                    <CheckCircle2 className="size-3.5 shrink-0" />
                  )}
                  <span className="min-w-0 truncate">{transition.label}</span>
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
