'use client';

import { CalendarClock, Clock } from 'lucide-react';
import { LEAD_STATUS_LABELS, type LeadDto } from '@oficina/shared';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { appointmentSummary, formatDateTime, isPastAppointment, STATUS_VARIANT } from '../reception-utils';
import { WhatsAppNumberLink } from './whatsapp-number-link';

export function ReceptionCard({
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
