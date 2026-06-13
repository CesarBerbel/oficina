'use client';

import type { LeadDto } from '@oficina/shared';
import { ReceptionCard } from './reception-card';

export function ReceptionList({
  leads,
  selectedId,
  emptyMessage = 'Nenhum atendimento nesta visão.',
  onSelect,
}: {
  leads: LeadDto[];
  selectedId?: string;
  emptyMessage?: string;
  onSelect: (id: string) => void;
}) {
  if (leads.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-2">
      {leads.map((lead) => (
        <ReceptionCard
          key={lead.id}
          lead={lead}
          selected={selectedId === lead.id}
          onSelect={() => onSelect(lead.id)}
        />
      ))}
    </div>
  );
}
