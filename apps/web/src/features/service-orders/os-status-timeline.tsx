import {
  SERVICE_ORDER_STATUS_LABELS,
  type ServiceOrderStatus,
  type ServiceOrderStatusHistoryDto,
} from '@oficina/shared';
import { cn } from '@/lib/utils';

type TimelineHistoryEntry = Pick<
  ServiceOrderStatusHistoryDto,
  'status' | 'createdAt'
>;

type TimelineStep = {
  status: ServiceOrderStatus;
  label: string;
};

const TIMELINE_STEPS: TimelineStep[] = [
  { status: 'ENTRADA', label: 'Entrada' },
  { status: 'DIAGNOSTICO_PRONTO', label: 'Diagnóstico pronto' },
  { status: 'ORCAMENTO_APROVADO', label: 'Orçamento aprovado' },
  { status: 'EM_EXECUCAO', label: 'Em execução' },
  { status: 'EM_TESTE', label: 'Testado' },
  { status: 'PRONTA', label: 'Finalizado' },
  { status: 'PRONTO_RETIRAR', label: 'Cliente avisado' },
  { status: 'ENTREGUE', label: 'Veículo retirado' },
];

const STATUS_DISPLAY_LABELS: Partial<Record<ServiceOrderStatus, string>> = {
  ORCAMENTO: 'Aguardando aprovação',
  ORCAMENTO_RECUSADO: 'Orçamento recusado',
  AGUARDANDO_PECA: 'Aguardando peça',
  EM_TESTE: 'Testado',
  PRONTA: 'Finalizado',
  PRONTO_RETIRAR: 'Cliente avisado',
  ENTREGUE: 'Veículo retirado',
};

const STATUS_PILL_CLASS: Partial<Record<ServiceOrderStatus, string>> = {
  CANCELADA: 'bg-red-100 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900',
  ORCAMENTO_RECUSADO: 'bg-red-100 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900',
  AGUARDANDO_PECA: 'bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900',
  ENTREGUE: 'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900',
  PRONTA: 'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900',
  PRONTO_RETIRAR: 'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900',
};

export function OsStatusTimeline({
  status,
  history,
}: {
  status: ServiceOrderStatus;
  history: TimelineHistoryEntry[];
}) {
  const entriesByStatus = new Map<ServiceOrderStatus, TimelineHistoryEntry>();

  for (const entry of [...history].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )) {
    if (!entriesByStatus.has(entry.status)) entriesByStatus.set(entry.status, entry);
  }

  const completedStatuses = new Set(entriesByStatus.keys());

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
            Entradas de estados
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada etapa fica marcada quando a OS entra no respectivo estado.
          </p>
        </div>
        <span
          className={cn(
            'inline-flex rounded-full bg-amber-300 px-3 py-1 text-xs font-medium text-amber-950 ring-1 ring-amber-400/60 sm:text-sm',
            STATUS_PILL_CLASS[status],
          )}
        >
          Atual: {STATUS_DISPLAY_LABELS[status] ?? SERVICE_ORDER_STATUS_LABELS[status]}
        </span>
      </div>

      <div className="mt-8 overflow-x-auto pb-2">
        <ol className="grid min-w-[920px] grid-cols-8 items-start gap-0">
          {TIMELINE_STEPS.map((step, index) => {
            const entry = entriesByStatus.get(step.status);
            const completed = completedStatuses.has(step.status);
            const previousCompleted =
              index === 0 || completedStatuses.has(TIMELINE_STEPS[index - 1].status);
            const nextCompleted =
              index < TIMELINE_STEPS.length - 1 &&
              completedStatuses.has(TIMELINE_STEPS[index + 1].status);

            return (
              <li key={step.status} className="relative flex flex-col items-center text-center">
                <p className="mb-5 flex min-h-10 max-w-[9.5rem] items-end justify-center px-2 text-sm font-medium leading-snug text-foreground">
                  {step.label}
                </p>

                {index > 0 && (
                  <span
                    className={cn(
                      'absolute left-0 top-[4.75rem] h-0.5 w-1/2 bg-border',
                      completed && previousCompleted && 'bg-emerald-600',
                    )}
                    aria-hidden="true"
                  />
                )}
                {index < TIMELINE_STEPS.length - 1 && (
                  <span
                    className={cn(
                      'absolute right-0 top-[4.75rem] h-0.5 w-1/2 bg-border',
                      completed && nextCompleted && 'bg-emerald-600',
                    )}
                    aria-hidden="true"
                  />
                )}

                <span
                  className={cn(
                    'relative z-10 grid size-11 place-items-center rounded-full text-sm font-bold shadow-sm ring-4',
                    completed
                      ? 'bg-emerald-600 text-white ring-emerald-100 dark:ring-emerald-950'
                      : 'bg-muted text-muted-foreground ring-background',
                  )}
                  aria-label={`${step.label}: ${completed ? 'concluído' : 'pendente'}`}
                >
                  {completed ? <span className="text-2xl leading-none">✓</span> : index + 1}
                </span>

                <div className="mt-3 min-h-10 text-xs text-muted-foreground">
                  {entry ? (
                    <>
                      <p>{formatTimelineDate(entry.createdAt)}</p>
                      <p>{formatTimelineTime(entry.createdAt)}</p>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function formatTimelineDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(new Date(value));
}

function formatTimelineTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
