'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Loader2,
  Save,
  User,
  Car,
  Clock,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  FileDown,
  ClipboardCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  SERVICE_ORDER_TRANSITIONS,
  SERVICE_ORDER_STATUS_LABELS,
  type ServiceOrderStatus,
} from '@oficina/shared';
import { ApiError, openAuthedResource } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  useServiceOrder,
  useUpdateServiceOrder,
  useChangeStatus,
} from '@/features/service-orders/use-service-orders';
import { StatusBadge } from '@/features/service-orders/status-badge';
import { OsItems } from '@/features/service-orders/os-items';
import { OsCatalogPicker } from '@/features/service-orders/os-catalog-picker';
import { OsQuoteSection } from '@/features/service-orders/os-quote-section';
import { OsStatusTimeline } from '@/features/service-orders/os-status-timeline';
import { AiAssistButton } from '@/features/ai/ai-assist-button';
import { formatCurrency, formatDate } from '@/lib/utils';
import { maskPhone } from '@/lib/masks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BackButton } from '@/components/back-button';

export default function ServiceOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('os:write');
  const canStatus = hasPermission('os:status');
  const canQuote = hasPermission('quotes:write');
  const canCheckin = hasPermission('checkins:write');

  const { data: os, isLoading } = useServiceOrder(id);
  const update = useUpdateServiceOrder(id);
  const changeStatus = useChangeStatus(id);

  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState('0');

  useEffect(() => {
    if (os) {
      setDiagnosis(os.diagnosis ?? '');
      setNotes(os.notes ?? '');
      setDiscount(String(os.discount));
    }
  }, [os]);

  if (isLoading) {
    return (
      <div className="grid h-64 place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!os) return <p className="text-muted-foreground">OS não encontrada.</p>;

  // Reabrir o orçamento (ORCAMENTO_APROVADO → DIAGNOSTICO_PRONTO) é uma ação
  // dedicada na seção de orçamento, não um avanço de status — fica fora da barra.
  const nextStatuses = (SERVICE_ORDER_TRANSITIONS[os.status] ?? []).filter(
    (s) => !(os.status === 'ORCAMENTO_APROVADO' && s === 'DIAGNOSTICO_PRONTO'),
  );
  const dirty =
    diagnosis !== (os.diagnosis ?? '') ||
    notes !== (os.notes ?? '') ||
    Number(discount) !== os.discount;

  async function saveChanges() {
    try {
      await update.mutateAsync({
        diagnosis,
        notes,
        discount: Number(discount) || 0,
      });
      toast.success('Alterações salvas');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao salvar');
    }
  }

  async function moveTo(status: ServiceOrderStatus) {
    if (status === 'CANCELADA' && !confirm('Cancelar esta OS? A ação trava a edição.'))
      return;
    // Diagnóstico pronto exige o diagnóstico salvo (o back valida o valor persistido).
    if (status === 'DIAGNOSTICO_PRONTO' && (os?.diagnosis ?? '').trim() === '') {
      toast.error('Preencha e salve o diagnóstico técnico antes de concluir o diagnóstico.');
      return;
    }
    try {
      await changeStatus.mutateAsync({ status });
      toast.success(`Status: ${SERVICE_ORDER_STATUS_LABELS[status]}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Transição inválida');
    }
  }

  return (
    <div className="space-y-6">
      {/* Capa */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <BackButton fallbackHref="/os" iconOnly />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">OS #{os.number}</h1>
              <StatusBadge status={os.status} />
              {os.isOverdue && (
                <span className="inline-flex items-center gap-1 text-sm text-destructive">
                  <AlertTriangle className="size-4" /> atrasada
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Aberta em {formatDate(os.openedAt)}
              {os.dueDate && ` · prevista para ${formatDate(os.dueDate)}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCheckin && (
            <Button variant="outline" asChild>
              <Link href={`/check-in/novo?vehicleId=${os.vehicleId}&osId=${os.id}&returnTo=${encodeURIComponent(`/os/${os.id}`)}`}>
                <ClipboardCheck className="size-4" /> Fazer check-in
              </Link>
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() =>
              openAuthedResource(`/service-orders/${os.id}/pdf`).catch(() =>
                toast.error('Erro ao gerar o PDF'),
              )
            }
          >
            <FileDown className="size-4" /> Gerar PDF
          </Button>
        </div>
      </div>

      {/* Ações de status */}
      {canStatus && nextStatuses.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-3">
          <span className="self-center text-sm text-muted-foreground">Avançar para:</span>
          {nextStatuses.map((s) => {
            const negative = s === 'CANCELADA' || s === 'ORCAMENTO_RECUSADO';
            return (
              <Button
                key={s}
                size="sm"
                variant={negative ? 'destructive' : 'default'}
                disabled={changeStatus.isPending}
                onClick={() => moveTo(s)}
              >
                {negative ? (
                  <XCircle className="size-4" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                {SERVICE_ORDER_STATUS_LABELS[s]}
              </Button>
            );
          })}
        </div>
      )}

      <OsStatusTimeline status={os.status} history={os.history} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Cliente / Veículo */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <User className="size-4" /> Cliente
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <Link href={`/clientes/${os.customerId}?returnTo=${encodeURIComponent(`/os/${os.id}`)}`} className="font-medium hover:underline">
                  {os.customerName}
                </Link>
                <p className="text-muted-foreground">{os.customerPhone ? maskPhone(os.customerPhone) : 'Sem telefone'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Car className="size-4" /> Veículo
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p className="font-medium">
                  {os.vehicleManufacturer} {os.vehicleModel}
                  {os.vehicleModelYear ? ` · ${os.vehicleModelYear}` : ''}
                </p>
                <p className="text-muted-foreground">
                  {os.vehiclePlate}
                  {os.km != null ? ` · ${os.km.toLocaleString('pt-BR')} km` : ''}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Relato / Diagnóstico / Observações */}
          <Card>
            <CardContent className="space-y-4 p-5">
              <Section title="Problema relatado">
                <p className="whitespace-pre-wrap text-sm">{os.reportedProblem}</p>
              </Section>
              <Section
                title="Diagnóstico técnico"
                action={
                  os.editable && canWrite ? (
                    <AiAssistButton
                      instruction="Elabore um diagnóstico técnico claro e profissional para uma ordem de serviço de oficina, a partir do problema relatado."
                      content={diagnosis || os.reportedProblem}
                      onResult={setDiagnosis}
                    />
                  ) : undefined
                }
              >
                <Textarea
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  placeholder="Descreva o diagnóstico..."
                  disabled={!os.editable || !canWrite}
                  rows={3}
                />
              </Section>
              <Section
                title="Observações"
                action={
                  os.editable && canWrite ? (
                    <AiAssistButton
                      instruction="Escreva observações claras e cordiais para o cliente sobre o andamento desta ordem de serviço."
                      content={notes}
                      onResult={setNotes}
                    />
                  ) : undefined
                }
              >
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observações internas..."
                  disabled={!os.editable || !canWrite}
                  rows={2}
                />
              </Section>
            </CardContent>
          </Card>

          {/* Itens */}
          <Card>
            <CardHeader>
              <CardTitle>Serviços e Peças</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {os.editable && canWrite && <OsCatalogPicker osId={os.id} />}
              <OsItems
                osId={os.id}
                kind="SERVICE"
                items={os.items.filter((i) => i.kind === 'SERVICE')}
                editable={os.editable}
                canWrite={canWrite}
              />
              <OsItems
                osId={os.id}
                kind="PART"
                items={os.items.filter((i) => i.kind === 'PART')}
                serviceItems={os.items.filter((i) => i.kind === 'SERVICE')}
                editable={os.editable}
                canWrite={canWrite}
              />
            </CardContent>
          </Card>
        </div>

        {/* Coluna lateral: resumo + timeline */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Resumo financeiro</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Serviços" value={formatCurrency(os.totalServices)} />
              <Row label="Peças" value={formatCurrency(os.totalParts)} />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Desconto</span>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">R$</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    disabled={!os.editable || !canWrite}
                    className="h-8 w-24 text-right"
                  />
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between border-t pt-2 text-base font-semibold">
                <span>Total</span>
                <span>{formatCurrency(os.total)}</span>
              </div>
            </CardContent>
          </Card>

          {canWrite && os.editable && (
            <Button className="w-full" onClick={saveChanges} disabled={!dirty || update.isPending}>
              {update.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Salvar alterações
            </Button>
          )}

          <OsQuoteSection
            osId={os.id}
            osStatus={os.status}
            quote={os.quote}
            publicToken={os.publicToken}
            editable={os.editable}
            canQuote={canQuote}
          />

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="size-4" /> Histórico detalhado
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l pl-4">
                {os.history.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="absolute -left-[1.36rem] top-1 size-2.5 rounded-full bg-primary" />
                    <p className="text-sm font-medium">
                      {SERVICE_ORDER_STATUS_LABELS[h.status]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(h.createdAt).toLocaleString('pt-BR')}
                      {h.userName ? ` · ${h.userName}` : ''}
                    </p>
                    {h.note && <p className="text-xs text-muted-foreground">{h.note}</p>}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
