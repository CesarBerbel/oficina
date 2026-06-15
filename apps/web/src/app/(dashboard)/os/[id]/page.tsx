'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Save, User, Car, AlertTriangle, XCircle, CheckCircle2, FileDown, ClipboardCheck, CircleDollarSign } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import {
  SERVICE_ORDER_STATUS_LABELS,
  type ServiceOrderTransitionDto,
} from '@oficina/shared';
import { ApiError, openAuthedResource } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  useServiceOrder,
  useUpdateServiceOrder,
  useDiagnoseServiceOrder,
  useChangeStatus,
} from '@/features/service-orders/use-service-orders';
import { StatusBadge } from '@/features/service-orders/status-badge';
import { OsItems } from '@/features/service-orders/os-items';
import { OsCatalogPicker } from '@/features/service-orders/os-catalog-picker';
import { OsQuoteSection } from '@/features/service-orders/os-quote-section';
import { OsStatusTimeline } from '@/features/service-orders/os-status-timeline';
import { OsEventTimeline } from '@/features/service-orders/os-event-timeline';
import { OsTechnicalMobilePanel } from '@/features/service-orders/os-technical-mobile-panel';
import { AiAssistButton } from '@/features/ai/ai-assist-button';
import { formatCurrency, formatDate } from '@/lib/utils';
import { maskPhone } from '@/lib/masks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BackButton } from '@/components/back-button';
import { useSyncServiceOrderFinancial } from '@/features/financial/use-financial';

export default function ServiceOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('os:write');
  const canDiagnose = hasPermission('os:diagnose');
  const canStatus = hasPermission('os:status');
  const canQuote = hasPermission('quotes:write');
  const canCheckin = hasPermission('checkins:write');
  const canFinance = hasPermission('finance:write');

  const { data: os, isLoading } = useServiceOrder(id);
  const update = useUpdateServiceOrder(id);
  const diagnose = useDiagnoseServiceOrder(id);
  const changeStatus = useChangeStatus(id);
  const syncFinancial = useSyncServiceOrderFinancial();

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
        <CarLoader className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!os) return <p className="text-muted-foreground">OS não encontrada.</p>;

  const serviceOrder = os;
  const nextTransitions = serviceOrder.availableTransitions ?? [];
  const canEditDiagnosis = os.editable && (canWrite || canDiagnose);
  const dirtyText =
    diagnosis !== (os.diagnosis ?? '') || notes !== (os.notes ?? '');
  const dirtyFinancial = Number(discount) !== os.discount;
  const dirty = dirtyText || (canWrite && dirtyFinancial);

  async function saveChanges() {
    try {
      if (canWrite) {
        await update.mutateAsync({
          diagnosis,
          notes,
          discount: Number(discount) || 0,
        });
      } else if (canDiagnose) {
        await diagnose.mutateAsync({ diagnosis, notes });
      }
      toast.success('Alterações salvas');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao salvar');
    }
  }

  async function generateReceivable() {
    try {
      await syncFinancial.mutateAsync({ serviceOrderId: serviceOrder.id });
      toast.success('Conta a receber gerada/atualizada');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao gerar financeiro');
    }
  }

  async function moveTo(transition: ServiceOrderTransitionDto) {
    if (transition.disabledReason) {
      toast.error(transition.disabledReason);
      return;
    }
    if (
      transition.requiresConfirmation &&
      !confirm(`${transition.label}? ${transition.description}`)
    ) {
      return;
    }

    try {
      await changeStatus.mutateAsync({ status: transition.status });
      toast.success(`Status: ${SERVICE_ORDER_STATUS_LABELS[transition.status]}`);
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
          {os.checkinId ? (
            <Button variant="outline" asChild>
              <Link href={`/check-in/${os.checkinId}?returnTo=${encodeURIComponent(`/os/${os.id}`)}`}>
                <ClipboardCheck className="size-4" /> Ver check-in
              </Link>
            </Button>
          ) : (
            canCheckin && (
              <Button variant="outline" asChild>
                <Link href={`/check-in/novo?vehicleId=${os.vehicleId}&osId=${os.id}&returnTo=${encodeURIComponent(`/os/${os.id}`)}`}>
                  <ClipboardCheck className="size-4" /> Fazer check-in
                </Link>
              </Button>
            )
          )}
          {canFinance && (
            <Button variant="outline" disabled={syncFinancial.isPending} onClick={generateReceivable}>
              {syncFinancial.isPending ? <CarLoader className="size-4 animate-spin" /> : <CircleDollarSign className="size-4" />}
              Gerar financeiro
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
      {canStatus && nextTransitions.length > 0 && (
        <div className="space-y-2 rounded-xl border bg-card p-3">
          <div className="flex flex-wrap gap-2">
            <span className="self-center text-sm text-muted-foreground">
              Próximas ações:
            </span>
            {nextTransitions.map((transition) => {
              const disabled = changeStatus.isPending || !!transition.disabledReason;
              return (
                <Button
                  key={transition.status}
                  size="sm"
                  variant={transition.destructive ? 'destructive' : 'default'}
                  disabled={disabled}
                  title={transition.disabledReason ?? transition.description}
                  onClick={() => moveTo(transition)}
                >
                  {transition.destructive ? (
                    <XCircle className="size-4" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  {transition.label}
                </Button>
              );
            })}
          </div>
          {nextTransitions.some((transition) => transition.disabledReason) && (
            <div className="space-y-1 text-xs text-muted-foreground">
              {nextTransitions
                .filter((transition) => transition.disabledReason)
                .map((transition) => (
                  <p key={`${transition.status}-reason`}>
                    {transition.label}: {transition.disabledReason}
                  </p>
                ))}
            </div>
          )}
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
                  canEditDiagnosis ? (
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
                  disabled={!canEditDiagnosis}
                  rows={3}
                />
              </Section>
              <Section
                title="Observações"
                action={
                  canEditDiagnosis ? (
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
                  disabled={!canEditDiagnosis}
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

          {(canWrite || canDiagnose) && os.editable && (
            <Button
              className="w-full"
              onClick={saveChanges}
              disabled={!dirty || update.isPending || diagnose.isPending}
            >
              {update.isPending || diagnose.isPending ? (
                <CarLoader className="size-4 animate-spin" />
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

          {canDiagnose && (
            <OsTechnicalMobilePanel osId={os.id} disabled={os.terminal} />
          )}

          <OsEventTimeline events={os.events ?? []} />
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
