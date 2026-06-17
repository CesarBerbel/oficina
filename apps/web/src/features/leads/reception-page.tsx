'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ClipboardList, KanbanSquare, ListChecks, Search } from 'lucide-react';
import { toast } from 'sonner';
import { LEAD_STATUSES, LEAD_STATUS_LABELS, type LeadStatus } from '@oficina/shared';
import { CarLoader } from '@/components/car-loader';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { DirectReceptionDialog } from './components/direct-reception-dialog';
import { LeadDetailPanel } from './components/lead-detail-panel';
import { ReceptionAgendaView } from './components/reception-agenda-view';
import {
  ReceptionAlertsPanel,
  normalizeReceptionAlerts,
} from './components/reception-alerts-panel';
import { ReceptionKanban } from './components/reception-kanban';
import { ReceptionList } from './components/reception-list';
import { ReceptionMetricsGrid, type ReceptionMetricsValue } from './components/reception-metrics';
import { ACTIVE_STATUS, appointmentTime, isToday, leadPriority } from './reception-utils';
import { useLeads, useReceptionAlerts } from './use-leads';

const VIEW_OPTIONS = [
  { id: 'fila', label: 'Fila', icon: ListChecks },
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
  { id: 'kanban', label: 'Kanban', icon: KanbanSquare },
  { id: 'lista', label: 'Lista', icon: ClipboardList },
] as const;

type ReceptionView = (typeof VIEW_OPTIONS)[number]['id'];

export function ReceptionPage() {
  const [view, setView] = useState<ReceptionView>('fila');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [now, setNow] = useState(() => Date.now());
  const lastAlertToastKey = useRef('');
  const { data, isLoading } = useLeads({
    page: 1,
    pageSize: 200,
    status: (status || undefined) as LeadStatus | undefined,
    search: search || undefined,
  });
  const { data: receptionAlerts } = useReceptionAlerts();
  const leads = useMemo(() => data?.data ?? [], [data?.data]);
  const alerts = normalizeReceptionAlerts(receptionAlerts);
  const fullScreenView = view === 'agenda' || view === 'kanban';

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const key = [
      alerts.generatedAt,
      alerts.upcomingArrivals.map((lead) => lead.id).join(','),
      alerts.noShowCandidates.map((lead) => lead.id).join(','),
      alerts.overdueFollowUps.map((lead) => lead.id).join(','),
      alerts.checkedInWithoutOs.map((lead) => lead.id).join(','),
    ].join(':');
    if (key === lastAlertToastKey.current) return;
    lastAlertToastKey.current = key;

    if (alerts.noShowCandidates.length > 0) {
      toast.warning(
        `${alerts.noShowCandidates.length} cliente(s) passaram do horário. Registre o não comparecimento ou atualize a chegada.`,
      );
      return;
    }

    if (alerts.checkedInWithoutOs.length > 0) {
      toast.info(
        `${alerts.checkedInWithoutOs.length} cliente(s) chegaram e ainda precisam virar OS.`,
      );
      return;
    }

    if (alerts.overdueFollowUps.length > 0) {
      toast.warning(`${alerts.overdueFollowUps.length} retorno(s) combinados estão vencidos.`);
      return;
    }

    if (alerts.upcomingArrivals.length > 0) {
      toast.info(
        `${alerts.upcomingArrivals.length} cliente(s) estão próximos do horário de chegada.`,
      );
    }
  }, [alerts]);

  const metrics: ReceptionMetricsValue = useMemo(() => {
    const active = leads.filter((lead) => ACTIVE_STATUS.has(lead.status));
    const scheduledToday = leads.filter(
      (lead) => lead.appointmentStartAt && isToday(lead.appointmentStartAt),
    );
    return {
      newItems: leads.filter((lead) => lead.status === 'NOVO').length,
      awaitingReturn: leads.filter((lead) => lead.status === 'RETORNAR_DEPOIS').length,
      scheduledToday: scheduledToday.length,
      confirmedToday: scheduledToday.filter((lead) => lead.status === 'CONFIRMADO').length,
      checkedIn: leads.filter((lead) => lead.status === 'CLIENTE_CHEGOU').length,
      converted: leads.filter((lead) => lead.status === 'CONVERTIDO').length,
      active: active.length,
    };
  }, [leads]);

  const visibleLeads = useMemo(() => {
    const base = [...leads].sort((a, b) => leadPriority(a, now) - leadPriority(b, now));
    if (view === 'fila') return base.filter((lead) => ACTIVE_STATUS.has(lead.status));
    if (view === 'agenda') {
      return base
        .filter((lead) => Boolean(lead.appointmentStartAt))
        .sort((a, b) => (appointmentTime(a) ?? 0) - (appointmentTime(b) ?? 0));
    }
    return base;
  }, [leads, view, now]);

  useEffect(() => {
    if (!selectedId && visibleLeads[0]) setSelectedId(visibleLeads[0].id);
    if (
      selectedId &&
      visibleLeads.length > 0 &&
      !visibleLeads.some((lead) => lead.id === selectedId)
    ) {
      setSelectedId(visibleLeads[0]?.id);
    }
  }, [selectedId, visibleLeads]);

  function selectLead(id: string, nextView?: ReceptionView) {
    setSelectedId(id);
    if (nextView) setView(nextView);
  }

  return (
    <div
      className={cn(
        'min-h-0 gap-4',
        fullScreenView ? 'flex flex-col' : 'grid xl:grid-cols-[24rem_1fr]',
      )}
    >
      <aside
        className={cn('min-h-0 rounded-xl border bg-card', fullScreenView && 'overflow-hidden')}
      >
        <div className="border-b p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Recepção</p>
              <h1 className="text-2xl font-bold tracking-tight">Central de Atendimento</h1>
              <p className="text-sm text-muted-foreground">
                Fila, agenda, confirmação, chegada e conversão para OS em uma jornada única.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge variant="outline">{metrics.active} ativos</Badge>
              <DirectReceptionDialog
                onCreated={(created) => {
                  setSelectedId(created.id);
                  setView('fila');
                }}
              />
            </div>
          </div>

          <ReceptionMetricsGrid metrics={metrics} wide={fullScreenView} />

          <ReceptionAlertsPanel
            alerts={alerts}
            onSelect={(leadId) => selectLead(leadId, 'agenda')}
          />

          <div className="mt-4 grid grid-cols-4 gap-1 rounded-lg bg-muted p-1">
            {VIEW_OPTIONS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  className={cn(
                    'flex h-9 items-center justify-center gap-1 rounded-md text-xs font-medium transition',
                    view === item.id
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  aria-label={item.label}
                  title={item.label}
                >
                  <Icon className="size-4" />
                  <span className="hidden sm:inline xl:hidden 2xl:inline">{item.label}</span>
                </button>
              );
            })}
          </div>

          <div
            className={cn(
              'mt-4 grid gap-2',
              fullScreenView ? 'lg:grid-cols-[1fr_16rem]' : 'space-y-2',
            )}
          >
            <div className="relative">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar nome, telefone, placa..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Todos os status</option>
              {LEAD_STATUSES.map((item) => (
                <option key={item} value={item}>
                  {LEAD_STATUS_LABELS[item]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div
          className={cn(
            view === 'kanban' &&
              'h-[calc(100dvh-23rem)] min-h-[30rem] overflow-x-auto overflow-y-hidden p-3',
            view === 'agenda' && 'h-[calc(100dvh-23rem)] min-h-[30rem] overflow-y-auto p-3',
            view !== 'agenda' &&
              view !== 'kanban' &&
              'max-h-[calc(100dvh-22rem)] overflow-y-auto p-2',
          )}
        >
          {isLoading ? (
            <div className="grid h-40 place-items-center">
              <CarLoader className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : leads.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhum atendimento encontrado.
            </p>
          ) : view === 'kanban' ? (
            <ReceptionKanban
              leads={leads}
              selectedId={selectedId}
              now={now}
              onSelect={(id) => selectLead(id)}
            />
          ) : view === 'agenda' ? (
            <ReceptionAgendaView
              leads={visibleLeads}
              selectedId={selectedId}
              onSelect={(id) => selectLead(id)}
            />
          ) : (
            <ReceptionList
              leads={visibleLeads}
              selectedId={selectedId}
              onSelect={(id) => selectLead(id)}
            />
          )}
        </div>
      </aside>

      <LeadDetailPanel id={selectedId} />
    </div>
  );
}
