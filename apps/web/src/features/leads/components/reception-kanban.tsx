'use client';

import { BellRing, CalendarClock, CheckCircle2, MessageCircle, UserCheck, type LucideIcon } from 'lucide-react';
import { type LeadDto, type LeadStatus } from '@oficina/shared';
import { Badge } from '@/components/ui/badge';
import { leadPriority } from '../reception-utils';
import { ReceptionCard } from './reception-card';

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

export function ReceptionKanban({
  leads,
  selectedId,
  now,
  onSelect,
}: {
  leads: LeadDto[];
  selectedId?: string;
  now: number;
  onSelect: (id: string) => void;
}) {
  return (
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
                    onSelect={() => onSelect(lead.id)}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
