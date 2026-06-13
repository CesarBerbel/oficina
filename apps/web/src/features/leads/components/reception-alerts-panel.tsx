'use client';

import { BellRing, CalendarClock, PhoneCall, UserCheck, XCircle } from 'lucide-react';
import type { ReceptionAlertLeadDto, ReceptionAlertsDto } from '@oficina/shared';
import { cn } from '@/lib/utils';
import { timeOnly } from '../reception-utils';

const EMPTY_ALERTS: ReceptionAlertsDto = {
  generatedAt: '',
  arrivalWindowMinutes: 60,
  noShowToleranceMinutes: 15,
  upcomingArrivals: [],
  noShowCandidates: [],
  overdueFollowUps: [],
  checkedInWithoutOs: [],
};

export function normalizeReceptionAlerts(alerts?: ReceptionAlertsDto): ReceptionAlertsDto {
  return alerts ?? EMPTY_ALERTS;
}

function AlertList({
  items,
  onSelect,
  kind,
}: {
  items: ReceptionAlertLeadDto[];
  onSelect: (leadId: string) => void;
  kind: 'arrival' | 'late' | 'followup' | 'checked-in';
}) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-1">
      {items.slice(0, 4).map((lead) => (
        <button
          key={lead.id}
          type="button"
          onClick={() => onSelect(lead.id)}
          className="block w-full truncate rounded-md px-2 py-1 text-left underline-offset-2 hover:bg-amber-100 hover:underline"
        >
          {kind === 'arrival' && `${timeOnly(lead.appointmentStartAt)} · ${lead.name}`}
          {kind === 'late' && `${timeOnly(lead.appointmentStartAt)} · ${lead.name}`}
          {kind === 'followup' && `${lead.name}${lead.nextFollowUpAt ? ` · retorno ${timeOnly(lead.nextFollowUpAt)}` : ''}`}
          {kind === 'checked-in' && `${lead.name}${lead.checkedInAt ? ` · chegou ${timeOnly(lead.checkedInAt)}` : ''}`}
          {lead.minutesUntilAppointment !== null ? ` · em ${lead.minutesUntilAppointment} min` : ''}
          {lead.minutesLate !== null ? ` · ${lead.minutesLate} min` : ''}
        </button>
      ))}
    </div>
  );
}

function AlertSection({
  title,
  description,
  items,
  icon: Icon,
  tone,
  onSelect,
  kind,
}: {
  title: string;
  description: string;
  items: ReceptionAlertLeadDto[];
  icon: typeof BellRing;
  tone: 'amber' | 'red' | 'blue' | 'emerald';
  onSelect: (leadId: string) => void;
  kind: 'arrival' | 'late' | 'followup' | 'checked-in';
}) {
  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        'rounded-lg border p-2',
        tone === 'amber' && 'border-amber-300 bg-amber-50 text-amber-950',
        tone === 'red' && 'border-red-300 bg-red-50 text-red-950',
        tone === 'blue' && 'border-blue-300 bg-blue-50 text-blue-950',
        tone === 'emerald' && 'border-emerald-300 bg-emerald-50 text-emerald-950',
      )}
    >
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide">
            {title} · {items.length}
          </p>
          <p className="mt-0.5 text-xs opacity-80">{description}</p>
          <div className="mt-1 text-xs">
            <AlertList items={items} onSelect={onSelect} kind={kind} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReceptionAlertsPanel({
  alerts,
  onSelect,
}: {
  alerts?: ReceptionAlertsDto;
  onSelect: (leadId: string) => void;
}) {
  const normalized = normalizeReceptionAlerts(alerts);
  const hasAlerts =
    normalized.upcomingArrivals.length > 0 ||
    normalized.noShowCandidates.length > 0 ||
    normalized.overdueFollowUps.length > 0 ||
    normalized.checkedInWithoutOs.length > 0;
  if (!hasAlerts) return null;

  return (
    <div className="mt-4 space-y-2 rounded-xl border bg-card p-3">
      <div className="flex items-center gap-2">
        <BellRing className="size-4 text-primary" />
        <div>
          <p className="text-sm font-semibold">Alertas da recepção</p>
          <p className="text-xs text-muted-foreground">
            Calculados pela API a cada minuto para chegada, atrasos, retornos e clientes aguardando OS.
          </p>
        </div>
      </div>

      <AlertSection
        title="Passaram do horário"
        description="Registre chegada ou marque não comparecimento."
        items={normalized.noShowCandidates}
        icon={XCircle}
        tone="red"
        onSelect={onSelect}
        kind="late"
      />
      <AlertSection
        title="Chegaram sem OS"
        description="Converta em OS ou cancele a chegada."
        items={normalized.checkedInWithoutOs}
        icon={UserCheck}
        tone="emerald"
        onSelect={onSelect}
        kind="checked-in"
      />
      <AlertSection
        title="Retornos vencidos"
        description="Cliente ou oficina combinou retorno e o horário já passou."
        items={normalized.overdueFollowUps}
        icon={PhoneCall}
        tone="blue"
        onSelect={onSelect}
        kind="followup"
      />
      <AlertSection
        title="Perto de chegar"
        description={`Próximos ${normalized.arrivalWindowMinutes} minutos.`}
        items={normalized.upcomingArrivals}
        icon={CalendarClock}
        tone="amber"
        onSelect={onSelect}
        kind="arrival"
      />
    </div>
  );
}
