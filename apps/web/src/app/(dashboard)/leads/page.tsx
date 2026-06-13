'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BellRing,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  KanbanSquare,
  ListChecks,
  Mail,
  MessageCircle,
  Phone,
  Search,
  UserPlus,
  UserCheck,
  Wrench,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  LEAD_CONFLICT_LEVEL_LABELS,
  LEAD_CONTACT_CHANNEL_LABELS,
  LEAD_CONTACT_CHANNELS,
  LEAD_CONTACT_OUTCOME_LABELS,
  LEAD_CONTACT_OUTCOMES,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  type CreateDirectReceptionLeadInput,
  type LeadConflictLevel,
  type LeadContactChannel,
  type LeadContactOutcome,
  type LeadDetailDto,
  type LeadDto,
  type LeadStatus,
} from '@oficina/shared';
import { CarLoader } from '@/components/car-loader';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCustomers } from '@/features/customers/use-customers';
import {
  useCancelLeadAppointment,
  useCancelLeadCheckIn,
  useCheckInLead,
  useConfirmLeadAppointment,
  useCreateDirectReceptionLead,
  useConvertLeadToServiceOrder,
  useLead,
  useLeads,
  useLinkLeadCustomer,
  useLinkLeadVehicle,
  useNoShowLead,
  useRegisterLeadContact,
  useScheduleLead,
  useUpdateLeadStatus,
} from '@/features/leads/use-leads';
import { useTechnicians } from '@/features/service-orders/use-service-orders';
import { useVehicles } from '@/features/vehicles/use-vehicles';
import { ApiError } from '@/lib/api';
import { buildWhatsAppHref } from '@/lib/contact-links';
import { maskPhone } from '@/lib/masks';
import { cn, formatDate } from '@/lib/utils';

const STATUS_VARIANT: Record<LeadStatus, BadgeProps['variant']> = {
  NOVO: 'default',
  EM_ATENDIMENTO: 'warning',
  CONTATO_REALIZADO: 'outline',
  RETORNAR_DEPOIS: 'warning',
  AGENDADO: 'default',
  CONFIRMADO: 'success',
  CLIENTE_CHEGOU: 'success',
  CONVERTIDO: 'success',
  NAO_COMPARECEU: 'destructive',
  CANCELADO: 'secondary',
  PERDIDO: 'secondary',
  DUPLICADO: 'secondary',
  INVALIDO: 'destructive',
  DESCARTADO: 'secondary',
};

const CONFLICT_VARIANT: Record<LeadConflictLevel, BadgeProps['variant']> = {
  OK: 'success',
  ATENCAO: 'warning',
  CONFLITO: 'destructive',
  SEM_DADOS: 'secondary',
};

const VIEW_OPTIONS = [
  { id: 'fila', label: 'Fila', icon: ListChecks },
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
  { id: 'kanban', label: 'Kanban', icon: KanbanSquare },
  { id: 'lista', label: 'Lista', icon: ClipboardList },
] as const;

type ReceptionView = (typeof VIEW_OPTIONS)[number]['id'];

const JOURNEY_COLUMNS: Array<{
  title: string;
  statuses: LeadStatus[];
  helper: string;
  icon: LucideIcon;
}> = [
  { title: 'Novo', statuses: ['NOVO'], helper: 'Ainda sem primeira ação', icon: BellRing },
  {
    title: 'Em contato',
    statuses: ['EM_ATENDIMENTO', 'CONTATO_REALIZADO', 'RETORNAR_DEPOIS'],
    helper: 'Atendimento em andamento',
    icon: MessageCircle,
  },
  { title: 'Agenda', statuses: ['AGENDADO', 'CONFIRMADO'], helper: 'Horário marcado', icon: CalendarClock },
  { title: 'Chegou', statuses: ['CLIENTE_CHEGOU'], helper: 'Pronto para virar OS', icon: UserCheck },
  {
    title: 'Encerrados',
    statuses: ['CONVERTIDO', 'NAO_COMPARECEU', 'CANCELADO', 'PERDIDO', 'DUPLICADO', 'INVALIDO', 'DESCARTADO'],
    helper: 'Sem ação imediata',
    icon: CheckCircle2,
  },
];

const ACTIVE_STATUS = new Set<LeadStatus>([
  'NOVO',
  'EM_ATENDIMENTO',
  'CONTATO_REALIZADO',
  'RETORNAR_DEPOIS',
  'AGENDADO',
  'CONFIRMADO',
  'CLIENTE_CHEGOU',
]);

const ARRIVAL_NOTICE_WINDOW_MINUTES = 60;
const NO_SHOW_TOLERANCE_MINUTES = 15;

const OPEN_APPOINTMENT_STATUSES = new Set<LeadStatus>(['AGENDADO', 'CONFIRMADO']);
const CLOSED_RECEPTION_STATUSES = new Set<LeadStatus>([
  'CONVERTIDO',
  'NAO_COMPARECEU',
  'CANCELADO',
  'PERDIDO',
  'DUPLICADO',
  'INVALIDO',
  'DESCARTADO',
]);

function appointmentTime(lead: Pick<LeadDto, 'appointmentStartAt'>): number | null {
  if (!lead.appointmentStartAt) return null;
  const time = new Date(lead.appointmentStartAt).getTime();
  return Number.isNaN(time) ? null : time;
}

function isUpcomingArrival(lead: LeadDto, now: number): boolean {
  if (!OPEN_APPOINTMENT_STATUSES.has(lead.status)) return false;
  const time = appointmentTime(lead);
  if (!time) return false;
  const diff = time - now;
  return diff >= 0 && diff <= ARRIVAL_NOTICE_WINDOW_MINUTES * 60_000;
}

function isNoShowCandidate(lead: LeadDto, now: number): boolean {
  if (!OPEN_APPOINTMENT_STATUSES.has(lead.status)) return false;
  const time = appointmentTime(lead);
  if (!time) return false;
  return now - time >= NO_SHOW_TOLERANCE_MINUTES * 60_000;
}

function WhatsAppNumberLink({
  value,
  label,
  showIcon = false,
  className,
  onClick,
}: {
  value: string | null | undefined;
  label?: string;
  showIcon?: boolean;
  className?: string;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  const href = buildWhatsAppHref(value);
  if (!href || !value) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className={cn('inline-flex items-center gap-1.5 hover:text-primary hover:underline', className)}
    >
      {showIcon && <MessageCircle className="size-3.5" />}
      {label ? `${label}: ` : null}
      {maskPhone(value)}
    </a>
  );
}

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Não foi possível concluir a operação';
}

function toIsoFromLocalInput(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function toLocalDateTimeInput(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function currentLocalDateTimeInput(): string {
  return toLocalDateTimeInput(new Date().toISOString());
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Sem horário';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Horário inválido';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function timeOnly(value: string | null | undefined): string {
  if (!value) return '--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function isToday(value: string | null | undefined): boolean {
  if (!value) return false;
  const date = new Date(value);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function isPastAppointment(lead: LeadDto, now = Date.now()): boolean {
  return isNoShowCandidate(lead, now);
}

function leadPriority(lead: LeadDto, now = Date.now()): number {
  if (lead.status === 'CLIENTE_CHEGOU') return 0;
  if (isPastAppointment(lead, now)) return 1;
  if (lead.nextFollowUpAt && new Date(lead.nextFollowUpAt).getTime() <= now) return 2;
  if (lead.status === 'NOVO') return 3;
  if (lead.appointmentStartAt && isToday(lead.appointmentStartAt)) return 4;
  return 5;
}

function appointmentSummary(lead: LeadDto): string {
  if (!lead.appointmentStartAt) return 'Sem agendamento';
  const end = lead.appointmentEndAt ? ` até ${timeOnly(lead.appointmentEndAt)}` : '';
  return `${formatDateTime(lead.appointmentStartAt)}${end}`;
}

function ReceptionCard({
  lead,
  selected,
  compact = false,
  onSelect,
}: {
  lead: LeadDto;
  selected: boolean;
  compact?: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'w-full cursor-pointer rounded-lg border p-3 text-left transition hover:bg-accent',
        selected && 'border-primary bg-primary/5',
        isPastAppointment(lead) && 'border-amber-300 bg-amber-50/70',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{lead.name}</p>
          <p className="text-xs text-muted-foreground">Recebido em {formatDate(lead.createdAt)}</p>
        </div>
        <Badge variant={STATUS_VARIANT[lead.status]}>{LEAD_STATUS_LABELS[lead.status]}</Badge>
      </div>
      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        <WhatsAppNumberLink
          value={lead.phone}
          showIcon
          className="text-xs"
          onClick={(event) => event.stopPropagation()}
        />
        {lead.plate && <p>Placa: {lead.plate}</p>}
        {lead.vehicle && <p className="truncate">Veículo: {lead.vehicle}</p>}
        {lead.appointmentStartAt && (
          <p className="flex items-center gap-1.5 text-primary">
            <CalendarClock className="size-3" /> {appointmentSummary(lead)}
          </p>
        )}
        {!compact && lead.nextFollowUpAt && (
          <p className="flex items-center gap-1.5 text-amber-700">
            <Clock className="size-3" /> Retorno: {formatDateTime(lead.nextFollowUpAt)}
          </p>
        )}
        {isPastAppointment(lead) && (
          <p className="font-medium text-amber-700">Agendamento atrasado ou pendente de baixa.</p>
        )}
      </div>
    </div>
  );
}

export default function LeadsPage() {
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
  const leads = data?.data ?? [];

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const alerts = useMemo(() => {
    const upcomingArrivals = leads
      .filter((lead) => isUpcomingArrival(lead, now))
      .sort((a, b) => (appointmentTime(a) ?? 0) - (appointmentTime(b) ?? 0));
    const noShowCandidates = leads
      .filter((lead) => isNoShowCandidate(lead, now))
      .sort((a, b) => (appointmentTime(a) ?? 0) - (appointmentTime(b) ?? 0));

    return { upcomingArrivals, noShowCandidates };
  }, [leads, now]);

  useEffect(() => {
    const key = `${alerts.upcomingArrivals.length}:${alerts.noShowCandidates.length}`;
    if (key === lastAlertToastKey.current) return;
    lastAlertToastKey.current = key;

    if (alerts.noShowCandidates.length > 0) {
      toast.warning(
        `${alerts.noShowCandidates.length} cliente(s) passaram do horário. Registre o não comparecimento ou atualize a chegada.`,
      );
      return;
    }

    if (alerts.upcomingArrivals.length > 0) {
      toast.info(`${alerts.upcomingArrivals.length} cliente(s) estão próximos do horário de chegada.`);
    }
  }, [alerts]);

  const metrics = useMemo(() => {
    const active = leads.filter((lead) => ACTIVE_STATUS.has(lead.status));
    const scheduledToday = leads.filter((lead) => lead.appointmentStartAt && isToday(lead.appointmentStartAt));
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
        .sort((a, b) => new Date(a.appointmentStartAt ?? 0).getTime() - new Date(b.appointmentStartAt ?? 0).getTime());
    }
    return base;
  }, [leads, view, now]);

  useEffect(() => {
    if (!selectedId && visibleLeads[0]) setSelectedId(visibleLeads[0].id);
    if (selectedId && visibleLeads.length > 0 && !visibleLeads.some((lead) => lead.id === selectedId)) {
      setSelectedId(visibleLeads[0]?.id);
    }
  }, [selectedId, visibleLeads]);

  return (
    <div
      className={cn(
        'min-h-0 gap-4',
        view === 'kanban' ? 'flex flex-col' : 'grid xl:grid-cols-[24rem_1fr]',
      )}
    >
      <aside className={cn('min-h-0 rounded-xl border bg-card', view === 'kanban' && 'overflow-hidden')}>
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

          <div
            className={cn(
              'mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3',
              view === 'kanban' ? 'lg:grid-cols-6' : 'xl:grid-cols-2',
            )}
          >
            <Metric label="Novos" value={metrics.newItems} />
            <Metric label="Retornos" value={metrics.awaitingReturn} />
            <Metric label="Hoje" value={metrics.scheduledToday} />
            <Metric label="Confirmados" value={metrics.confirmedToday} />
            <Metric label="Chegaram" value={metrics.checkedIn} />
            <Metric label="Viraram OS" value={metrics.converted} />
          </div>

          {(alerts.upcomingArrivals.length > 0 || alerts.noShowCandidates.length > 0) && (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950">
              <div className="flex items-start gap-2">
                <BellRing className="mt-0.5 size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Alertas da recepção</p>
                  <div className="mt-2 space-y-2 text-xs">
                    {alerts.upcomingArrivals.length > 0 && (
                      <div>
                        <p className="font-medium">{alerts.upcomingArrivals.length} cliente(s) perto do horário de chegada</p>
                        {alerts.upcomingArrivals.slice(0, 2).map((lead) => (
                          <button
                            key={lead.id}
                            type="button"
                            onClick={() => { setSelectedId(lead.id); setView('agenda'); }}
                            className="mt-1 block truncate text-left underline-offset-2 hover:underline"
                          >
                            {timeOnly(lead.appointmentStartAt)} · {lead.name}
                          </button>
                        ))}
                      </div>
                    )}
                    {alerts.noShowCandidates.length > 0 && (
                      <div>
                        <p className="font-medium">{alerts.noShowCandidates.length} cliente(s) passaram do horário</p>
                        <p>Selecione o atendimento e registre “Não veio” se o cliente realmente não compareceu.</p>
                        {alerts.noShowCandidates.slice(0, 2).map((lead) => (
                          <button
                            key={lead.id}
                            type="button"
                            onClick={() => { setSelectedId(lead.id); setView('agenda'); }}
                            className="mt-1 block truncate text-left underline-offset-2 hover:underline"
                          >
                            {timeOnly(lead.appointmentStartAt)} · {lead.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

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
                    view === item.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
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

          <div className={cn('mt-4 grid gap-2', view === 'kanban' ? 'lg:grid-cols-[1fr_16rem]' : 'space-y-2')}>
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
            view === 'kanban'
              ? 'h-[calc(100dvh-23rem)] min-h-[30rem] overflow-x-auto overflow-y-hidden p-3'
              : 'max-h-[calc(100dvh-22rem)] overflow-y-auto p-2',
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
            <div className="flex h-full min-w-max gap-3 pb-2">
              {JOURNEY_COLUMNS.map((column) => {
                const Icon = column.icon;
                const columnLeads = [...leads]
                  .filter((lead) => column.statuses.includes(lead.status))
                  .sort((a, b) => leadPriority(a, now) - leadPriority(b, now));

                return (
                  <section
                    key={column.title}
                    className="flex h-full w-[19rem] shrink-0 flex-col rounded-xl border bg-background shadow-sm"
                  >
                    <div className="border-b p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-2">
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                            <Icon className="size-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{column.title}</p>
                            <p className="text-[11px] leading-tight text-muted-foreground">{column.helper}</p>
                          </div>
                        </div>
                        <Badge variant="secondary">{columnLeads.length}</Badge>
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                      {columnLeads.length === 0 ? (
                        <div className="grid min-h-28 place-items-center rounded-lg border border-dashed bg-muted/30 p-4 text-center text-xs text-muted-foreground">
                          Nenhum atendimento nesta etapa.
                        </div>
                      ) : (
                        columnLeads.map((lead) => (
                          <ReceptionCard
                            key={lead.id}
                            lead={lead}
                            compact
                            selected={selectedId === lead.id}
                            onSelect={() => setSelectedId(lead.id)}
                          />
                        ))
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {visibleLeads.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Nenhum atendimento nesta visão.
                </p>
              ) : (
                visibleLeads.map((lead) => (
                  <ReceptionCard
                    key={lead.id}
                    lead={lead}
                    selected={selectedId === lead.id}
                    onSelect={() => setSelectedId(lead.id)}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </aside>

      <LeadDetailPanel id={selectedId} />
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

const DIRECT_RECEPTION_INITIAL_FORM = {
  name: '',
  phone: '',
  email: '',
  plate: '',
  vehicle: '',
  message: '',
  appointmentServiceType: 'Atendimento presencial',
  appointmentNotes: '',
};

function DirectReceptionDialog({ onCreated }: { onCreated: (lead: LeadDetailDto) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DIRECT_RECEPTION_INITIAL_FORM);
  const createDirectReception = useCreateDirectReceptionLead();

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetAndClose() {
    setOpen(false);
    setForm(DIRECT_RECEPTION_INITIAL_FORM);
  }

  async function submitDirectReception(event: React.FormEvent) {
    event.preventDefault();

    const input: CreateDirectReceptionLeadInput = {
      name: form.name,
      phone: form.phone,
      email: form.email || undefined,
      plate: form.plate || undefined,
      vehicle: form.vehicle || undefined,
      message: form.message || 'Cliente recebido direto na oficina.',
      appointmentServiceType: form.appointmentServiceType || undefined,
      appointmentNotes: form.appointmentNotes || undefined,
    };

    try {
      const created = await createDirectReception.mutateAsync(input);
      toast.success('Cliente recebido na oficina');
      onCreated(created);
      resetAndClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setForm(DIRECT_RECEPTION_INITIAL_FORM); }}>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" /> Receber direto
      </Button>
      <DialogContent className="max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receber cliente direto na oficina</DialogTitle>
          <DialogDescription>
            Use quando o cliente chegou sem atendimento anterior. O sistema cria o atendimento presencial já como “Cliente chegou”, com agenda marcada para agora e pronto para converter em OS.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submitDirectReception} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Nome do cliente</Label>
              <Input value={form.name} onChange={(event) => update('name', event.target.value)} required minLength={2} />
            </div>
            <div>
              <Label>Telefone / WhatsApp</Label>
              <Input value={form.phone} onChange={(event) => update('phone', maskPhone(event.target.value))} required minLength={8} />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} />
            </div>
            <div>
              <Label>Placa</Label>
              <Input value={form.plate} onChange={(event) => update('plate', event.target.value.toUpperCase())} placeholder="ABC1D23" />
            </div>
            <div>
              <Label>Veículo</Label>
              <Input value={form.vehicle} onChange={(event) => update('vehicle', event.target.value)} placeholder="Ex.: Gol 1.0 2018" />
            </div>
            <div className="sm:col-span-2">
              <Label>Tipo de atendimento</Label>
              <Input value={form.appointmentServiceType} onChange={(event) => update('appointmentServiceType', event.target.value)} placeholder="Ex.: diagnóstico, revisão, retorno, garantia..." />
            </div>
            <div className="sm:col-span-2">
              <Label>Problema relatado</Label>
              <Textarea value={form.message} onChange={(event) => update('message', event.target.value)} required minLength={3} placeholder="Ex.: cliente chegou relatando barulho na suspensão..." />
            </div>
            <div className="sm:col-span-2">
              <Label>Observação interna da recepção</Label>
              <Textarea value={form.appointmentNotes} onChange={(event) => update('appointmentNotes', event.target.value)} placeholder="Ex.: veículo já está no pátio, aguardando abertura da OS." />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={resetAndClose}>
              Cancelar
            </Button>
            <Button disabled={createDirectReception.isPending}>
              <UserCheck className="size-4" /> Receber e abrir jornada
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LeadDetailPanel({ id }: { id?: string }) {
  const { data: lead, isLoading } = useLead(id);
  const [contact, setContact] = useState<{
    channel: LeadContactChannel;
    outcome: LeadContactOutcome;
    notes: string;
    nextFollowUpAt: string;
  }>({
    channel: 'TELEFONE',
    outcome: 'ATENDEU',
    notes: '',
    nextFollowUpAt: '',
  });
  const [schedule, setSchedule] = useState({
    appointmentStartAt: '',
    appointmentEndAt: '',
    appointmentServiceType: '',
    appointmentNotes: '',
  });
  const [customerId, setCustomerId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', whatsapp: '', email: '', notes: '' });
  const [newVehicle, setNewVehicle] = useState({
    plate: '',
    manufacturer: '',
    model: '',
    modelYear: '',
    color: '',
    currentKm: '',
    notes: '',
  });
  const [technicianId, setTechnicianId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [reportedProblem, setReportedProblem] = useState('');

  const { data: customers } = useCustomers({ page: 1, pageSize: 500 });
  const { data: vehicles } = useVehicles({ customerId: customerId || undefined, page: 1, pageSize: 500 });
  const { data: technicians } = useTechnicians();
  const updateStatus = useUpdateLeadStatus();
  const registerContact = useRegisterLeadContact();
  const scheduleLead = useScheduleLead();
  const confirmAppointment = useConfirmLeadAppointment();
  const checkInLead = useCheckInLead();
  const noShowLead = useNoShowLead();
  const cancelCheckIn = useCancelLeadCheckIn();
  const cancelAppointment = useCancelLeadAppointment();
  const linkCustomer = useLinkLeadCustomer();
  const linkVehicle = useLinkLeadVehicle();
  const convertLead = useConvertLeadToServiceOrder();

  useEffect(() => {
    if (!lead) return;
    setCustomerId(lead.matchedCustomerId ?? lead.match.suggestedCustomers[0]?.id ?? '');
    setVehicleId(lead.matchedVehicleId ?? lead.match.vehicle?.id ?? '');
    setNewCustomer({
      name: lead.name,
      phone: lead.phone,
      whatsapp: lead.phone,
      email: lead.email ?? '',
      notes: `Criado a partir do atendimento ${lead.id}`,
    });
    setNewVehicle({
      plate: lead.plate ?? lead.match.vehicle?.plate ?? '',
      manufacturer: '',
      model: lead.vehicle ?? '',
      modelYear: '',
      color: '',
      currentKm: '',
      notes: lead.vehicle ? `Informado no site: ${lead.vehicle}` : '',
    });
    setReportedProblem(lead.message);
    const appointmentStartAt = lead.appointmentStartAt
      ? toLocalDateTimeInput(lead.appointmentStartAt)
      : currentLocalDateTimeInput();
    const appointmentEndAt = lead.appointmentEndAt
      ? toLocalDateTimeInput(lead.appointmentEndAt)
      : appointmentStartAt;
    setSchedule({
      appointmentStartAt,
      appointmentEndAt,
      appointmentServiceType: lead.appointmentServiceType ?? '',
      appointmentNotes: lead.appointmentNotes ?? '',
    });
    setContact({ channel: 'TELEFONE', outcome: 'ATENDEU', notes: '', nextFollowUpAt: '' });
  }, [lead]);

  const vehicleOptions = useMemo(() => vehicles?.data ?? [], [vehicles]);

  if (!id) {
    return (
      <section className="grid min-h-[22rem] place-items-center rounded-xl border bg-card p-8 text-center text-muted-foreground">
        Selecione um atendimento para iniciar a jornada da recepção.
      </section>
    );
  }

  if (isLoading || !lead) {
    return (
      <section className="grid min-h-[22rem] place-items-center rounded-xl border bg-card">
        <CarLoader className="size-6 animate-spin text-muted-foreground" />
      </section>
    );
  }

  const leadId = lead.id;
  const hasAppointment = Boolean(lead.appointmentStartAt);

  async function changeStatus(statusValue: LeadStatus) {
    try {
      await updateStatus.mutateAsync({ id: leadId, status: statusValue });
      toast.success('Status atualizado');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function submitContact(event: React.FormEvent) {
    event.preventDefault();
    try {
      await registerContact.mutateAsync({
        id: leadId,
        input: {
          channel: contact.channel,
          outcome: contact.outcome,
          notes: contact.notes || undefined,
          nextFollowUpAt: toIsoFromLocalInput(contact.nextFollowUpAt),
        },
      });
      setContact({ channel: 'TELEFONE', outcome: 'ATENDEU', notes: '', nextFollowUpAt: '' });
      toast.success('Contato registrado');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function submitSchedule(event: React.FormEvent) {
    event.preventDefault();
    const appointmentStartAt = toIsoFromLocalInput(schedule.appointmentStartAt);
    if (!appointmentStartAt) {
      toast.error('Informe data e horário do agendamento');
      return;
    }
    try {
      await scheduleLead.mutateAsync({
        id: leadId,
        input: {
          appointmentStartAt,
          appointmentEndAt: toIsoFromLocalInput(schedule.appointmentEndAt),
          appointmentServiceType: schedule.appointmentServiceType || undefined,
          appointmentNotes: schedule.appointmentNotes || undefined,
        },
      });
      toast.success(hasAppointment ? 'Agendamento remarcado' : 'Agendamento criado');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function runAppointmentAction(
    action: 'confirm' | 'check-in' | 'cancel-check-in' | 'no-show' | 'cancel',
    successMessage: string,
  ) {
    try {
      const input = { notes: schedule.appointmentNotes || undefined };
      if (action === 'confirm') await confirmAppointment.mutateAsync({ id: leadId, input });
      if (action === 'check-in') await checkInLead.mutateAsync({ id: leadId, input });
      if (action === 'cancel-check-in') await cancelCheckIn.mutateAsync({ id: leadId, input });
      if (action === 'no-show') await noShowLead.mutateAsync({ id: leadId, input });
      if (action === 'cancel') await cancelAppointment.mutateAsync({ id: leadId, input });
      toast.success(successMessage);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function submitLinkCustomer(targetCustomerId: string) {
    try {
      await linkCustomer.mutateAsync({ id: leadId, input: { customerId: targetCustomerId } });
      toast.success('Cliente vinculado');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function submitLinkVehicle(targetVehicleId: string) {
    try {
      await linkVehicle.mutateAsync({ id: leadId, input: { vehicleId: targetVehicleId } });
      toast.success('Veículo vinculado');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function submitConversion(event: React.FormEvent) {
    event.preventDefault();
    try {
      await convertLead.mutateAsync({
        id: leadId,
        input: {
          customerId: customerId || undefined,
          customer: customerId
            ? undefined
            : {
                name: newCustomer.name,
                phone: newCustomer.phone || undefined,
                whatsapp: newCustomer.whatsapp || undefined,
                email: newCustomer.email || undefined,
                notes: newCustomer.notes || undefined,
              },
          vehicleId: vehicleId || undefined,
          vehicle: vehicleId
            ? undefined
            : {
                plate: newVehicle.plate,
                manufacturer: newVehicle.manufacturer,
                model: newVehicle.model,
                modelYear: newVehicle.modelYear ? Number(newVehicle.modelYear) : undefined,
                color: newVehicle.color || undefined,
                currentKm: newVehicle.currentKm ? Number(newVehicle.currentKm) : undefined,
                notes: newVehicle.notes || undefined,
              },
          technicianId: technicianId || undefined,
          dueDate: toIsoFromLocalInput(dueDate),
          reportedProblem: reportedProblem || undefined,
        },
      });
      toast.success('Atendimento convertido em OS');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const conflictClass = {
    OK: 'border-emerald-300 bg-emerald-50 text-emerald-900',
    ATENCAO: 'border-amber-300 bg-amber-50 text-amber-900',
    CONFLITO: 'border-red-300 bg-red-50 text-red-900',
    SEM_DADOS: 'border-muted bg-muted/40 text-muted-foreground',
  }[lead.match.conflictLevel];

  const isCheckedIn = lead.status === 'CLIENTE_CHEGOU' || Boolean(lead.checkedInAt);
  const isConverted = lead.status === 'CONVERTIDO' || Boolean(lead.convertedServiceOrderId);
  const isClosed = CLOSED_RECEPTION_STATUSES.has(lead.status);
  const isScheduleReadOnly = isCheckedIn || isConverted || lead.status === 'NAO_COMPARECEU';
  const canEditSchedule = !isScheduleReadOnly;
  const canConfirmAppointment =
    hasAppointment && lead.status === 'AGENDADO' && !isScheduleReadOnly;
  const canCheckInAppointment =
    hasAppointment && OPEN_APPOINTMENT_STATUSES.has(lead.status) && !isScheduleReadOnly;
  const canMarkNoShow =
    hasAppointment && OPEN_APPOINTMENT_STATUSES.has(lead.status) && !isScheduleReadOnly;
  const canCancelAppointment =
    hasAppointment && !isConverted && !['CANCELADO', 'NAO_COMPARECEU'].includes(lead.status);
  const cancelAppointmentLabel = isCheckedIn
    ? 'Cancelar chegada do cliente'
    : 'Cancelar agendamento';
  const cancelAppointmentAction = isCheckedIn ? 'cancel-check-in' : 'cancel';
  const cancelAppointmentSuccess = isCheckedIn
    ? 'Chegada cancelada. A agenda voltou para edição.'
    : 'Agendamento cancelado';

  return (
    <section className="min-h-0 space-y-4 overflow-y-auto rounded-xl border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold">{lead.name}</h2>
            <Badge variant={STATUS_VARIANT[lead.status]}>{LEAD_STATUS_LABELS[lead.status]}</Badge>
            <Badge variant={CONFLICT_VARIANT[lead.match.conflictLevel]}>
              {LEAD_CONFLICT_LEVEL_LABELS[lead.match.conflictLevel]}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Recebido em {formatDateTime(lead.createdAt)} · Jornada da recepção até a abertura da OS.
          </p>
        </div>
        <Select value={lead.status} onChange={(event) => changeStatus(event.target.value as LeadStatus)} className="w-full sm:w-56">
          {LEAD_STATUSES.map((item) => (
            <option key={item} value={item}>{LEAD_STATUS_LABELS[item]}</option>
          ))}
        </Select>
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        <JourneyStep active={['NOVO', 'EM_ATENDIMENTO', 'CONTATO_REALIZADO', 'RETORNAR_DEPOIS'].includes(lead.status)} done={lead.status !== 'NOVO'} icon={MessageCircle} label="Atendimento" />
        <JourneyStep active={['AGENDADO', 'CONFIRMADO'].includes(lead.status)} done={Boolean(lead.appointmentStartAt)} icon={CalendarCheck} label="Agenda" />
        <JourneyStep active={lead.status === 'CLIENTE_CHEGOU'} done={Boolean(lead.checkedInAt) || lead.status === 'CONVERTIDO'} icon={UserCheck} label="Chegada" />
        <JourneyStep active={lead.status === 'CONVERTIDO'} done={lead.status === 'CONVERTIDO'} icon={Wrench} label="OS" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <h3 className="font-semibold">Dados do atendimento</h3>
            <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              <WhatsAppNumberLink value={lead.phone} label="WhatsApp" showIcon />
              <a href={`tel:${lead.phone.replace(/\D/g, '')}`} className="inline-flex items-center gap-2 hover:text-primary hover:underline">
                <Phone className="size-4" /> Ligar
              </a>
              {lead.email && <p className="flex items-center gap-2"><Mail className="size-4" /> {lead.email}</p>}
              {lead.plate && <p>Placa: <span className="font-medium text-foreground">{lead.plate}</span></p>}
              {lead.vehicle && <p>Veículo: <span className="font-medium text-foreground">{lead.vehicle}</span></p>}
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm">{lead.message}</p>
          </div>

          <div className={cn('rounded-xl border p-4', conflictClass)}>
            <div className="flex items-start gap-2">
              {lead.match.conflictLevel === 'OK' ? <CheckCircle2 className="mt-0.5 size-5" /> : <AlertTriangle className="mt-0.5 size-5" />}
              <div>
                <h3 className="font-semibold">Conferência automática</h3>
                <p className="mt-1 text-sm">{lead.match.conflictReason}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <h3 className="font-semibold">Cliente sugerido</h3>
            {lead.match.suggestedCustomers.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nenhum cliente parecido encontrado. Use a conversão para cadastrar um novo cliente.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {lead.match.suggestedCustomers.map((customer) => (
                  <div key={customer.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                    <div>
                      <p className="font-medium">{customer.name}</p>
                      <p className="text-xs text-muted-foreground">{customer.reason}</p>
                      <div className="space-y-0.5 text-xs text-muted-foreground">
                        {customer.phone && <p>Telefone: {maskPhone(customer.phone)}</p>}
                        {customer.whatsapp && <WhatsAppNumberLink value={customer.whatsapp} label="WhatsApp" className="text-xs" />}
                        {!customer.phone && !customer.whatsapp && customer.email && <p>{customer.email}</p>}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => submitLinkCustomer(customer.id)}>
                      Vincular cliente
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-card p-4">
            <h3 className="font-semibold">Veículo por placa</h3>
            {lead.match.vehicle ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <p className="font-medium">{lead.match.vehicle.plate}</p>
                  <p className="text-sm text-muted-foreground">
                    {lead.match.vehicle.manufacturer} {lead.match.vehicle.model} {lead.match.vehicle.modelYear ?? ''}
                  </p>
                  <p className="text-xs text-muted-foreground">Dono cadastrado: {lead.match.vehicle.customerName}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => submitLinkVehicle(lead.match.vehicle?.id ?? '')}>
                  Usar este veículo
                </Button>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Nenhum veículo encontrado pela placa informada.</p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <form onSubmit={submitSchedule} className="rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">Agenda embutida</h3>
                <p className="text-sm text-muted-foreground">Marque, remarque, confirme, registre chegada ou baixe o não comparecimento.</p>
              </div>
              {lead.appointmentStartAt && <Badge variant="outline">{appointmentSummary(lead)}</Badge>}
            </div>

            {isScheduleReadOnly && (
              <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950">
                {isCheckedIn
                  ? 'Cliente já chegou. A agenda está bloqueada para preservar o horário de chegada. Use “Cancelar chegada do cliente” se precisar reabrir a agenda.'
                  : 'Agenda bloqueada porque este atendimento já foi encerrado.'}
              </div>
            )}

            {isClosed && !isCheckedIn && (
              <div className="mt-3 rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
                Atendimento encerrado. Para uma nova visita, reagende usando “Remarcar agendamento” quando aplicável.
              </div>
            )}

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Início</Label>
                <Input
                  type="datetime-local"
                  value={schedule.appointmentStartAt}
                  readOnly={isScheduleReadOnly}
                  disabled={isScheduleReadOnly}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSchedule((cur) => ({ ...cur, appointmentStartAt: value, appointmentEndAt: value }));
                  }}
                />
              </div>
              <div>
                <Label>Fim</Label>
                <Input
                  type="datetime-local"
                  value={schedule.appointmentEndAt}
                  readOnly={isScheduleReadOnly}
                  disabled={isScheduleReadOnly}
                  onChange={(event) => setSchedule((cur) => ({ ...cur, appointmentEndAt: event.target.value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Tipo de atendimento</Label>
                <Input
                  value={schedule.appointmentServiceType}
                  readOnly={isScheduleReadOnly}
                  disabled={isScheduleReadOnly}
                  onChange={(event) => setSchedule((cur) => ({ ...cur, appointmentServiceType: event.target.value }))}
                  placeholder="Ex.: diagnóstico, revisão, retorno, garantia..."
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Observações da agenda</Label>
                <Textarea
                  value={schedule.appointmentNotes}
                  readOnly={isScheduleReadOnly}
                  disabled={isScheduleReadOnly}
                  onChange={(event) => setSchedule((cur) => ({ ...cur, appointmentNotes: event.target.value }))}
                  placeholder="Ex.: cliente prefere manhã, verificar suspensão dianteira..."
                />
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Button disabled={!canEditSchedule || scheduleLead.isPending}>
                <CalendarCheck className="size-4" /> {hasAppointment ? 'Remarcar agendamento' : 'Agendar'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!canConfirmAppointment || confirmAppointment.isPending || scheduleLead.isPending}
                onClick={() => runAppointmentAction('confirm', 'Agendamento confirmado')}
              >
                <CheckCircle2 className="size-4" /> Confirmar
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!canCheckInAppointment || checkInLead.isPending}
                onClick={() => runAppointmentAction('check-in', 'Chegada registrada')}
              >
                <UserCheck className="size-4" /> Cliente chegou
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!canMarkNoShow || noShowLead.isPending}
                onClick={() => runAppointmentAction('no-show', 'Não comparecimento registrado')}
              >
                <XCircle className="size-4" /> Não veio
              </Button>
              <Button
                type="button"
                variant="outline"
                className="sm:col-span-2"
                disabled={!canCancelAppointment || cancelAppointment.isPending || cancelCheckIn.isPending}
                onClick={() => runAppointmentAction(cancelAppointmentAction, cancelAppointmentSuccess)}
              >
                {cancelAppointmentLabel}
              </Button>
            </div>
          </form>

          <form onSubmit={submitContact} className="rounded-xl border bg-card p-4">
            <h3 className="font-semibold">Registrar contato</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Canal</Label>
                <Select value={contact.channel} onChange={(event) => setContact((cur) => ({ ...cur, channel: event.target.value as LeadContactChannel }))}>
                  {LEAD_CONTACT_CHANNELS.map((item) => (
                    <option key={item} value={item}>{LEAD_CONTACT_CHANNEL_LABELS[item]}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Resultado</Label>
                <Select value={contact.outcome} onChange={(event) => setContact((cur) => ({ ...cur, outcome: event.target.value as LeadContactOutcome }))}>
                  {LEAD_CONTACT_OUTCOMES.map((item) => (
                    <option key={item} value={item}>{LEAD_CONTACT_OUTCOME_LABELS[item]}</option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Retorno combinado</Label>
                <Input type="datetime-local" value={contact.nextFollowUpAt} onChange={(event) => setContact((cur) => ({ ...cur, nextFollowUpAt: event.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <Label>Observação</Label>
                <Textarea value={contact.notes} onChange={(event) => setContact((cur) => ({ ...cur, notes: event.target.value }))} placeholder="Ex.: cliente pediu retorno amanhã às 9h..." />
              </div>
            </div>
            <Button className="mt-3 w-full" disabled={registerContact.isPending}>
              Registrar contato
            </Button>
          </form>

          <form onSubmit={submitConversion} className="rounded-xl border bg-card p-4">
            <h3 className="font-semibold">Converter em cliente, veículo e OS</h3>
            <div className="mt-3 space-y-3">
              <div>
                <Label>Cliente existente</Label>
                <Select value={customerId} onChange={(event) => { setCustomerId(event.target.value); setVehicleId(''); }}>
                  <option value="">Cadastrar novo cliente</option>
                  {(customers?.data ?? []).map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                  ))}
                </Select>
              </div>

              {!customerId && (
                <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
                  <div className="sm:col-span-2"><Label>Nome</Label><Input value={newCustomer.name} onChange={(event) => setNewCustomer((cur) => ({ ...cur, name: event.target.value }))} /></div>
                  <div><Label>Telefone</Label><Input value={newCustomer.phone} onChange={(event) => setNewCustomer((cur) => ({ ...cur, phone: maskPhone(event.target.value) }))} /></div>
                  <div><Label>WhatsApp</Label><Input value={newCustomer.whatsapp} onChange={(event) => setNewCustomer((cur) => ({ ...cur, whatsapp: maskPhone(event.target.value) }))} /></div>
                  <div className="sm:col-span-2"><Label>E-mail</Label><Input value={newCustomer.email} onChange={(event) => setNewCustomer((cur) => ({ ...cur, email: event.target.value }))} /></div>
                </div>
              )}

              <div>
                <Label>Veículo existente</Label>
                <Select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} disabled={!customerId}>
                  <option value="">Cadastrar novo veículo</option>
                  {vehicleOptions.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} · {vehicle.manufacturer} {vehicle.model}</option>
                  ))}
                </Select>
              </div>

              {!vehicleId && (
                <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
                  <div><Label>Placa</Label><Input value={newVehicle.plate} onChange={(event) => setNewVehicle((cur) => ({ ...cur, plate: event.target.value.toUpperCase() }))} /></div>
                  <div><Label>KM</Label><Input inputMode="numeric" value={newVehicle.currentKm} onChange={(event) => setNewVehicle((cur) => ({ ...cur, currentKm: event.target.value }))} /></div>
                  <div><Label>Fabricante</Label><Input value={newVehicle.manufacturer} onChange={(event) => setNewVehicle((cur) => ({ ...cur, manufacturer: event.target.value }))} /></div>
                  <div><Label>Modelo</Label><Input value={newVehicle.model} onChange={(event) => setNewVehicle((cur) => ({ ...cur, model: event.target.value }))} /></div>
                  <div><Label>Ano</Label><Input inputMode="numeric" value={newVehicle.modelYear} onChange={(event) => setNewVehicle((cur) => ({ ...cur, modelYear: event.target.value }))} /></div>
                  <div><Label>Cor</Label><Input value={newVehicle.color} onChange={(event) => setNewVehicle((cur) => ({ ...cur, color: event.target.value }))} /></div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Técnico</Label>
                  <Select value={technicianId} onChange={(event) => setTechnicianId(event.target.value)}>
                    <option value="">Sem técnico definido</option>
                    {(technicians ?? []).map((technician) => (
                      <option key={technician.id} value={technician.id}>{technician.name}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Previsão</Label>
                  <Input type="datetime-local" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                </div>
              </div>
              <div>
                <Label>Problema relatado</Label>
                <Textarea value={reportedProblem} onChange={(event) => setReportedProblem(event.target.value)} />
              </div>
            </div>
            <Button className="mt-3 w-full" disabled={convertLead.isPending}>
              <ClipboardList className="size-4" /> Converter em OS
            </Button>
          </form>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <h3 className="font-semibold">Histórico de contatos</h3>
          <div className="mt-3 space-y-3">
            {lead.contactAttempts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum contato registrado.</p>
            ) : (
              lead.contactAttempts.map((attempt) => (
                <div key={attempt.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{LEAD_CONTACT_CHANNEL_LABELS[attempt.channel]} · {LEAD_CONTACT_OUTCOME_LABELS[attempt.outcome]}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(attempt.createdAt)} · {attempt.userName ?? 'Sistema'}</p>
                  {attempt.notes && <p className="mt-2 whitespace-pre-wrap">{attempt.notes}</p>}
                  {attempt.nextFollowUpAt && <p className="mt-2 text-amber-700">Retorno: {formatDateTime(attempt.nextFollowUpAt)}</p>}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h3 className="font-semibold">Timeline da jornada</h3>
          <div className="mt-3 space-y-3">
            {lead.events.map((event) => (
              <div key={event.id} className="border-l-2 border-primary/30 pl-3 text-sm">
                <p className="font-medium">{event.title}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(event.createdAt)} · {event.userName ?? 'Sistema'}</p>
                {event.description && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{event.description}</p>}
              </div>
            ))}
          </div>
          {lead.convertedServiceOrderId && (
            <Button asChild variant="outline" className="mt-4 w-full">
              <Link href={`/os/${lead.convertedServiceOrderId}`}>
                <Wrench className="size-4" /> Abrir OS convertida
              </Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function JourneyStep({
  active,
  done,
  icon: Icon,
  label,
}: {
  active: boolean;
  done: boolean;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <div className={cn('rounded-xl border bg-card p-3', active && 'border-primary bg-primary/5')}>
      <div className="flex items-center gap-2">
        <span className={cn('grid size-8 place-items-center rounded-full bg-muted text-muted-foreground', done && 'bg-primary/10 text-primary')}>
          <Icon className="size-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-xs text-muted-foreground">{done ? 'Registrado' : active ? 'Em andamento' : 'Pendente'}</p>
        </div>
      </div>
    </div>
  );
}
