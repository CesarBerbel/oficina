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

  const { outbox, ledger, ai, smtp, backup, health, alerts } = data;
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
          Outbox, ledger, IA, e-mail, backup e saúde (atualiza a cada 30s).
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Alertas</h2>
        {alerts.length === 0 ? (
          <div className="rounded-lg border border-emerald-600/30 bg-emerald-600/10 p-3 text-sm text-emerald-700">
            Tudo certo — nenhum alerta no momento.
          </div>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a, i) => (
              <li
                key={i}
                className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${
                  a.level === 'critical'
                    ? 'border-destructive/40 bg-destructive/10 text-destructive'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-700'
                }`}
              >
                <Badge variant="outline" className="uppercase">
                  {a.source}
                </Badge>
                <span>{a.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

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

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">IA</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Uso hoje" value={String(ai.usageToday)} />
          <Stat label="Uso no mês" value={String(ai.usageMonth)} />
          <Stat
            label="Falhas hoje"
            value={String(ai.failuresToday)}
            tone={ai.failuresToday > 0 ? 'text-destructive' : ''}
          />
          <Stat label="Último erro" value={ai.lastError ? '⚠️' : '—'} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Infraestrutura</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Banco de dados"
            value={health.dbOk ? 'OK' : 'falha'}
            tone={health.dbOk ? 'text-emerald-600' : 'text-destructive'}
          />
          <Stat
            label="E-mail (SMTP)"
            value={smtp.driver === 'log' ? 'log' : smtp.configured ? 'configurado' : 'incompleto'}
            tone={smtp.driver !== 'log' && !smtp.configured ? 'text-destructive' : ''}
          />
          <Stat
            label="Último backup"
            value={backup.ageHours == null ? 'nunca' : `${backup.ageHours}h`}
            tone={backup.ok ? 'text-emerald-600' : 'text-destructive'}
          />
          <Stat label="Limite backup" value={`${backup.maxAgeHours}h`} />
        </div>
      </section>
    </div>
  );
}
