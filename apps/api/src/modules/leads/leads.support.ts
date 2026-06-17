import { Prisma } from '@prisma/client';
import type { LeadStatus } from '@oficina/shared';

/**
 * Constantes, formatos de consulta (include), tipos e helpers puros do módulo de
 * leads. Extraídos do service para reduzir seu tamanho e permitir reuso/teste.
 */

export const UNIQUE_CONSTRAINT_RETRY_ATTEMPTS = 3;
export const RECEPTION_ALERT_ARRIVAL_WINDOW_MINUTES = 60;
export const RECEPTION_ALERT_NO_SHOW_TOLERANCE_MINUTES = 15;
export const OPEN_APPOINTMENT_STATUSES: LeadStatus[] = ['AGENDADO', 'CONFIRMADO'];
export const ACTIVE_RECEPTION_STATUSES: LeadStatus[] = [
  'NOVO',
  'EM_ATENDIMENTO',
  'CONTATO_REALIZADO',
  'RETORNAR_DEPOIS',
  'AGENDADO',
  'CONFIRMADO',
  'CLIENTE_CHEGOU',
];

export const leadDetailInclude = {
  contactAttempts: { orderBy: { createdAt: 'desc' } },
  events: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.LeadInclude;

export type LeadRow = Prisma.LeadGetPayload<object>;
export type LeadDetailRow = Prisma.LeadGetPayload<{ include: typeof leadDetailInclude }>;
export type ReceptionScheduleBlockRow = Prisma.ReceptionScheduleBlockGetPayload<{
  include: { technician: { select: { name: true } } };
}>;

export type CustomerSuggestionSource = {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
};

export type VehicleMatchSource = {
  id: string;
  plate: string;
  manufacturer: string;
  model: string;
  modelYear: number | null;
  customerId: string;
  customer: { name: string };
};

export type OperationalPriority = 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';

export function digits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

export function normalizePlate(value: string | null | undefined): string | null {
  const normalized = (value ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return normalized.length >= 7 ? normalized : null;
}

export function firstLine(value: string): string {
  return value.split(/\r?\n/)[0]?.trim() ?? value;
}

export function leadOperationalScore(
  lead: Pick<
    LeadRow,
    | 'status'
    | 'conflictLevel'
    | 'nextFollowUpAt'
    | 'appointmentStartAt'
    | 'checkedInAt'
    | 'convertedServiceOrderId'
    | 'createdAt'
  >,
): { score: number; priority: OperationalPriority; reasons: string[] } {
  const now = Date.now();
  let score = 0;
  const reasons: string[] = [];

  if (lead.conflictLevel === 'CONFLITO') {
    score += 45;
    reasons.push('conflito cliente/placa');
  } else if (lead.conflictLevel === 'ATENCAO') {
    score += 25;
    reasons.push('dados precisam de conferência');
  }

  if (lead.nextFollowUpAt && lead.nextFollowUpAt.getTime() <= now) {
    score += 35;
    reasons.push('retorno combinado vencido');
  }

  if (lead.appointmentStartAt) {
    const minutes = Math.round((lead.appointmentStartAt.getTime() - now) / 60_000);
    if (['AGENDADO', 'CONFIRMADO'].includes(lead.status) && minutes <= 15 && minutes >= 0) {
      score += 30;
      reasons.push('chegada nos próximos 15 minutos');
    }
    if (['AGENDADO', 'CONFIRMADO'].includes(lead.status) && minutes < -15) {
      score += 50;
      reasons.push('horário já passou');
    }
  }

  if (lead.status === 'CLIENTE_CHEGOU' && lead.checkedInAt && !lead.convertedServiceOrderId) {
    const waiting = Math.round((now - lead.checkedInAt.getTime()) / 60_000);
    if (waiting >= 10) {
      score += 45;
      reasons.push('cliente aguardando abertura da OS');
    }
  }
  const ageHours = Math.round((now - lead.createdAt.getTime()) / 3_600_000);
  if (['NOVO', 'EM_ATENDIMENTO'].includes(lead.status) && ageHours >= 24) {
    score += 20;
    reasons.push('atendimento aberto há mais de 24h');
  }

  const bounded = Math.min(100, score);
  const priority: OperationalPriority =
    bounded >= 80 ? 'CRITICA' : bounded >= 55 ? 'ALTA' : bounded >= 25 ? 'MEDIA' : 'BAIXA';
  return {
    score: bounded,
    priority,
    reasons: reasons.length > 0 ? reasons : ['sem pendências críticas'],
  };
}
