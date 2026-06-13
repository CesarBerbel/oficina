'use client';

export interface ReceptionMetricsValue {
  newItems: number;
  awaitingReturn: number;
  scheduledToday: number;
  confirmedToday: number;
  checkedIn: number;
  converted: number;
  active: number;
}

export function ReceptionMetricsGrid({
  metrics,
  wide = false,
}: {
  metrics: ReceptionMetricsValue;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6' : 'mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 xl:grid-cols-2'}>
      <Metric label="Novos" value={metrics.newItems} />
      <Metric label="Retornos" value={metrics.awaitingReturn} />
      <Metric label="Hoje" value={metrics.scheduledToday} />
      <Metric label="Confirmados" value={metrics.confirmedToday} />
      <Metric label="Chegaram" value={metrics.checkedIn} />
      <Metric label="Viraram OS" value={metrics.converted} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-bold leading-tight">{value}</p>
    </div>
  );
}
