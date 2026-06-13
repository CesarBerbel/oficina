'use client';

import { useMemo, useState } from 'react';
import { CalendarClock, Clock, Filter, UserCheck, XCircle } from 'lucide-react';
import { LEAD_STATUS_LABELS, type LeadDto } from '@oficina/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { appointmentSummary, dayLabel, isPastAppointment, STATUS_VARIANT, timeOnly } from '../reception-utils';
import { WhatsAppNumberLink } from './whatsapp-number-link';

type AgendaGroup = {
  key: string;
  title: string;
  leads: LeadDto[];
};

type AgendaScope = 'hoje' | 'amanha' | 'semana' | 'atrasados' | 'todos';

function appointmentDate(lead: LeadDto): Date | null {
  if (!lead.appointmentStartAt) return null;
  const date = new Date(lead.appointmentStartAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function isWithinNextWeek(date: Date, now = new Date()): boolean {
  const today = startOfDay(now).getTime();
  const limit = addDays(startOfDay(now), 7).getTime();
  const target = startOfDay(date).getTime();
  return target >= today && target <= limit;
}

function filterAgenda(leads: LeadDto[], scope: AgendaScope): LeadDto[] {
  const now = new Date();
  const tomorrow = addDays(now, 1);

  return leads.filter((lead) => {
    const date = appointmentDate(lead);
    if (!date) return false;
    if (scope === 'todos') return true;
    if (scope === 'atrasados') return isPastAppointment(lead);
    if (scope === 'hoje') return isSameDay(date, now) && !isPastAppointment(lead);
    if (scope === 'amanha') return isSameDay(date, tomorrow);
    return isWithinNextWeek(date, now) && !isPastAppointment(lead);
  });
}

function groupAgenda(leads: LeadDto[]): AgendaGroup[] {
  const scheduled = leads
    .filter((lead) => Boolean(lead.appointmentStartAt))
    .sort((a, b) => new Date(a.appointmentStartAt ?? 0).getTime() - new Date(b.appointmentStartAt ?? 0).getTime());

  const late = scheduled.filter((lead) => isPastAppointment(lead));
  const normal = scheduled.filter((lead) => !isPastAppointment(lead));
  const groups = new Map<string, AgendaGroup>();

  if (late.length > 0) {
    groups.set('late', { key: 'late', title: 'Atrasados / pendentes de baixa', leads: late });
  }

  normal.forEach((lead) => {
    const title = dayLabel(lead.appointmentStartAt);
    const key = title;
    const existing = groups.get(key) ?? { key, title, leads: [] };
    existing.leads.push(lead);
    groups.set(key, existing);
  });

  return Array.from(groups.values());
}

function countByScope(leads: LeadDto[], scope: AgendaScope): number {
  return filterAgenda(leads, scope).length;
}

export function ReceptionAgendaView({
  leads,
  selectedId,
  onSelect,
}: {
  leads: LeadDto[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const [scope, setScope] = useState<AgendaScope>('hoje');
  const filteredLeads = useMemo(() => filterAgenda(leads, scope), [leads, scope]);
  const groups = groupAgenda(filteredLeads);
  const scopeOptions: Array<{ id: AgendaScope; label: string }> = [
    { id: 'hoje', label: 'Hoje' },
    { id: 'amanha', label: 'Amanhã' },
    { id: 'semana', label: '7 dias' },
    { id: 'atrasados', label: 'Atrasados' },
    { id: 'todos', label: 'Todos' },
  ];

  if (leads.length === 0) {
    return (
      <div className="grid min-h-48 place-items-center rounded-xl border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        Nenhum atendimento com agendamento. Use o detalhe do atendimento para criar um horário.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-background p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CalendarClock className="size-4 text-primary" />
              <p className="font-semibold">Agenda da recepção</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Visão operacional por período, com prioridade para atrasos, chegadas e horários do dia.
            </p>
          </div>
          <Badge variant="outline">{leads.length} agendamento(s)</Badge>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {scopeOptions.map((option) => {
            const count = countByScope(leads, option.id);
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setScope(option.id)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition',
                  scope === option.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'bg-background text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {option.id === 'atrasados' && <Filter className="size-3" />}
                {option.label}
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="grid min-h-40 place-items-center rounded-xl border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          Nenhum atendimento para o filtro selecionado.
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="rounded-xl border bg-background">
            <div className="flex items-center justify-between gap-3 border-b p-3">
              <div className="flex items-center gap-2">
                {group.key === 'late' ? <XCircle className="size-4 text-amber-700" /> : <CalendarClock className="size-4 text-primary" />}
                <div>
                  <p className="text-sm font-semibold">{group.title}</p>
                  <p className="text-xs text-muted-foreground">{group.leads.length} atendimento(s)</p>
                </div>
              </div>
              <Badge variant={group.key === 'late' ? 'warning' : 'secondary'}>{group.leads.length}</Badge>
            </div>

            <div className="divide-y">
              {group.leads.map((lead) => {
                const late = isPastAppointment(lead);
                return (
                  <div
                    key={lead.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(lead.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelect(lead.id);
                      }
                    }}
                    className={cn(
                      'grid w-full gap-3 p-3 text-left transition hover:bg-accent sm:grid-cols-[5rem_1fr_auto]',
                      selectedId === lead.id && 'bg-primary/5',
                      late && 'bg-amber-50/60',
                    )}
                  >
                    <div className="flex items-center gap-2 sm:block">
                      <p className="text-lg font-bold leading-none">{timeOnly(lead.appointmentStartAt)}</p>
                      {lead.appointmentEndAt && (
                        <p className="text-xs text-muted-foreground sm:mt-1">até {timeOnly(lead.appointmentEndAt)}</p>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">{lead.name}</p>
                        <Badge variant={STATUS_VARIANT[lead.status]}>{LEAD_STATUS_LABELS[lead.status]}</Badge>
                        {late && <Badge variant="warning">Registrar não comparecimento?</Badge>}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {lead.appointmentServiceType || 'Atendimento'} · {appointmentSummary(lead)}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <WhatsAppNumberLink value={lead.phone} showIcon onClick={(event) => event.stopPropagation()} />
                        {lead.plate && <span>Placa: {lead.plate}</span>}
                        {lead.vehicle && <span className="truncate">{lead.vehicle}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground sm:justify-end">
                      {lead.status === 'CLIENTE_CHEGOU' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <UserCheck className="size-3.5" /> Chegou
                        </span>
                      ) : late ? (
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <Clock className="size-3.5" /> Atrasado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3.5" /> No horário
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
