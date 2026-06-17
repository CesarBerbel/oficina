'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Save, User, Car, AlertTriangle, XCircle, CheckCircle2, FileDown, ClipboardCheck, CircleDollarSign, MessageCircle } from 'lucide-react';
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
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { maskPhone, onlyDigits } from '@/lib/masks';

/** Monta o link wa.me a partir de um número BR (garante o código do país 55). */
function whatsappLink(value: string): string {
  const digits = onlyDigits(value);
  return `https://wa.me/${digits.length <= 11 ? `55${digits}` : digits}`;
}
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { BackButton } from '@/components/back-button';
import { useSyncServiceOrderFinancial } from '@/features/financial/use-financial';

type OsTab = 'resumo' | 'itens' | 'orcamento' | 'tecnico' | 'historico';

/**
 * Detalhe da OS. Em `variant="full"` é a tela completa de gestão; em
 * `variant="technician"` é a versão enxuta para o chão da oficina (aberta pelo
 * Kanban técnico): sem entradas de estados, sem resumo financeiro e sem
 * orçamento, com a aba Técnico em destaque.
 */
export function OsDetailView({
  id,
  variant,
}: {
  id: string;
  variant: 'full' | 'technician';
}) {
  const isTech = variant === 'technician';

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
  const confirm = useConfirm();

  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState('0');
  const [tab, setTab] = useState<OsTab>('resumo');

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

  // Diferenças entre a tela completa e a versão do técnico.
  const backHref = isTech ? '/kanban' : '/os';
  const selfHref = isTech ? `/os/${id}/tecnico` : `/os/${id}`;
  const showTimeline = !isTech;
  const showFinancial = !isTech;
  const showQuote = !isTech;
  const showTechTab = isTech && canDiagnose;

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
      toast.success(`Status: ${SERVICE_ORDER_STATUS_LABELS[transition.status]}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Transição inválida');
    }
  }

  const cover = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <BackButton fallbackHref={backHref} iconOnly />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">OS #{os.number}</h1>
            <StatusBadge status={os.status} />
            {isTech && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                Técnico
              </span>
            )}
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
            <Link href={`/check-in/${os.checkinId}?returnTo=${encodeURIComponent(selfHref)}`}>
              <ClipboardCheck className="size-4" /> Ver check-in
            </Link>
          </Button>
        ) : (
          canCheckin && (
            <Button variant="outline" asChild>
              <Link href={`/check-in/novo?vehicleId=${os.vehicleId}&osId=${os.id}&returnTo=${encodeURIComponent(selfHref)}`}>
                <ClipboardCheck className="size-4" /> Fazer check-in
              </Link>
            </Button>
          )
        )}
        {showFinancial && canFinance && (
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
  );

  const statusActions = canStatus && nextTransitions.length > 0 && (
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
  );

  const statusTimeline = <OsStatusTimeline history={os.history} />;

  const customerVehicle = (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="size-4" /> Cliente
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <Link href={`/clientes/${os.customerId}?returnTo=${encodeURIComponent(selfHref)}`} className="block font-medium hover:underline">
            {os.customerName}
          </Link>
          {os.customerWhatsapp ? (
            <a
              href={whatsappLink(os.customerWhatsapp)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 flex w-fit items-center gap-1 text-emerald-600 hover:underline"
            >
              <MessageCircle className="size-3.5" /> {maskPhone(os.customerWhatsapp)}
            </a>
          ) : os.customerPhone ? (
            <p className="text-muted-foreground">{maskPhone(os.customerPhone)}</p>
          ) : (
            <p className="text-muted-foreground">Sem contato</p>
          )}
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
  );

  const diagnosisCard = (
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
                field="os_diagnosis"
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
                field="os_notes"
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
  );

  const itemsCard = (
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
  );

  const financialSummary = (
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
  );

  const saveButton = (canWrite || canDiagnose) && os.editable && (
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
  );

  const quoteSection = (
    <OsQuoteSection
      osId={os.id}
      osStatus={os.status}
      quote={os.quote}
      publicToken={os.publicToken}
      editable={os.editable}
      canQuote={canQuote}
    />
  );

  const technicalPanel = canDiagnose && (
    <OsTechnicalMobilePanel osId={os.id} disabled={os.terminal} />
  );

  const eventTimeline = <OsEventTimeline events={os.events ?? []} />;

  // Abas: agrupam as seções por tarefa para evitar uma tela densa/com scroll.
  // Orçamento só na versão completa; Técnico só na versão do técnico.
  const contentTabs = (
    [
      { key: 'resumo', label: 'Resumo' },
      { key: 'itens', label: 'Itens' },
      showQuote ? { key: 'orcamento', label: 'Orçamento' } : null,
      showTechTab ? { key: 'tecnico', label: 'Técnico' } : null,
      { key: 'historico', label: 'Histórico' },
    ] as ({ key: OsTab; label: string } | null)[]
  ).filter((t): t is { key: OsTab; label: string } => t !== null);

  return (
    <div className="space-y-6">
      {cover}

      {/* Entradas de estado primeiro, próximas ações depois */}
      {showTimeline && statusTimeline}
      {statusActions}

      {/* Conteúdo em abas (desktop e mobile) */}
      <div className="space-y-4">
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-muted p-1">
          {contentTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
                tab === t.key
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'resumo' &&
          (showFinancial ? (
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                {customerVehicle}
                {diagnosisCard}
              </div>
              <div className="space-y-6">
                {financialSummary}
                {saveButton}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {customerVehicle}
              {diagnosisCard}
              {saveButton}
            </div>
          ))}
        {tab === 'itens' && <div className="space-y-6">{itemsCard}</div>}
        {tab === 'orcamento' && showQuote && (
          <div className="space-y-6">{quoteSection}</div>
        )}
        {tab === 'tecnico' && <div className="space-y-6">{technicalPanel}</div>}
        {tab === 'historico' && <div className="space-y-6">{eventTimeline}</div>}
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
