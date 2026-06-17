import { type ServiceOrderStatus, type ServiceOrderStatusHistoryDto } from '@oficina/shared';
import { cn } from '@/lib/utils';

type TimelineHistoryEntry = Pick<ServiceOrderStatusHistoryDto, 'status' | 'createdAt'>;

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

export function OsStatusTimeline({ history }: { history: TimelineHistoryEntry[] }) {
  const entriesByStatus = new Map<ServiceOrderStatus, TimelineHistoryEntry>();

  for (const entry of [...history].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )) {
    if (!entriesByStatus.has(entry.status)) entriesByStatus.set(entry.status, entry);
  }

  const completedStatuses = new Set(entriesByStatus.keys());

  return (
    <section className="rounded-xl border bg-card p-3 shadow-sm sm:p-4">
      <div className="overflow-x-auto pb-1">
        <ol className="grid min-w-[680px] grid-cols-8 items-start gap-0">
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
                <p className="mb-2 flex min-h-8 max-w-[7.5rem] items-end justify-center px-1 text-xs font-medium leading-tight text-foreground">
                  {step.label}
                </p>

                {index > 0 && (
                  <span
                    className={cn(
                      'absolute left-0 top-[3.5rem] h-0.5 w-1/2 bg-border',
                      completed && previousCompleted && 'bg-emerald-600',
                    )}
                    aria-hidden="true"
                  />
                )}
                {index < TIMELINE_STEPS.length - 1 && (
                  <span
                    className={cn(
                      'absolute right-0 top-[3.5rem] h-0.5 w-1/2 bg-border',
                      completed && nextCompleted && 'bg-emerald-600',
                    )}
                    aria-hidden="true"
                  />
                )}

                <span
                  className={cn(
                    'relative z-10 grid size-8 place-items-center rounded-full text-xs font-bold shadow-sm ring-2',
                    completed
                      ? 'bg-emerald-600 text-white ring-emerald-100 dark:ring-emerald-950'
                      : 'bg-muted text-muted-foreground ring-background',
                  )}
                  aria-label={`${step.label}: ${completed ? 'concluído' : 'pendente'}`}
                >
                  {completed ? <span className="text-base leading-none">✓</span> : index + 1}
                </span>

                <div className="mt-1.5 min-h-7 text-[11px] leading-tight text-muted-foreground">
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
