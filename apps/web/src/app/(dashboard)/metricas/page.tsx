'use client';

import { CarLoader } from '@/components/car-loader';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useSystemMetrics } from '@/features/metrics/use-metrics';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold tracking-tight ${tone ?? ''}`}>{value}</p>
    </div>
  );
}

export default function MetricasPage() {
  const { data, isLoading } = useSystemMetrics();

  if (isLoading || !data) return <CarLoader />;

  const { outbox, ledger } = data;
  const age =
    outbox.oldestPendingAgeSec == null
      ? '—'
      : outbox.oldestPendingAgeSec >= 60
        ? `${Math.floor(outbox.oldestPendingAgeSec / 60)} min`
        : `${outbox.oldestPendingAgeSec}s`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Métricas do sistema</h1>
        <p className="text-muted-foreground">
          Saúde do outbox de mensagens e do ledger financeiro (atualiza a cada 30s).
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Outbox de mensagens</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Pendentes" value={String(outbox.byStatus.pending)} />
          <Stat label="Processando" value={String(outbox.byStatus.processing)} />
          <Stat label="Concluídas" value={String(outbox.byStatus.done)} />
          <Stat
            label="Falhas"
            value={String(outbox.byStatus.failed)}
            tone={outbox.byStatus.failed > 0 ? 'text-destructive' : ''}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
          <Stat label="Pendentes elegíveis agora" value={String(outbox.pendingDue)} />
          <Stat label="Pendente mais antigo" value={age} />
        </div>

        {outbox.failures.length > 0 && (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Tentativas</TableHead>
                  <TableHead>Erro</TableHead>
                  <TableHead>Criada em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outbox.failures.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <Badge variant="secondary">{f.type}</Badge>
                    </TableCell>
                    <TableCell>{f.attempts}</TableCell>
                    <TableCell className="max-w-[420px] truncate text-destructive">
                      {f.lastError ?? '—'}
                    </TableCell>
                    <TableCell>{new Date(f.createdAt).toLocaleString('pt-BR')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Ledger financeiro</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Movimentos" value={String(ledger.movements)} />
          <Stat label="Emitido" value={brl(ledger.totalIssued)} />
          <Stat label="Baixado" value={brl(ledger.totalPaid)} />
          <Stat label="Em aberto" value={brl(ledger.outstanding)} />
        </div>
      </section>
    </div>
  );
}
