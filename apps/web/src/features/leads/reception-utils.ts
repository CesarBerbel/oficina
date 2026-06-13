import type { LeadConflictLevel, LeadDto, LeadStatus } from '@oficina/shared';
import type { BadgeProps } from '@/components/ui/badge';
import { ApiError } from '@/lib/api';

export const STATUS_VARIANT: Record<LeadStatus, BadgeProps['variant']> = {
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

export const CONFLICT_VARIANT: Record<LeadConflictLevel, BadgeProps['variant']> = {
  OK: 'success',
  ATENCAO: 'warning',
  CONFLITO: 'destructive',
  SEM_DADOS: 'secondary',
};

export const ACTIVE_STATUS = new Set<LeadStatus>([
  'NOVO',
  'EM_ATENDIMENTO',
  'CONTATO_REALIZADO',
  'RETORNAR_DEPOIS',
  'AGENDADO',
  'CONFIRMADO',
  'CLIENTE_CHEGOU',
]);

export const OPEN_APPOINTMENT_STATUSES = new Set<LeadStatus>(['AGENDADO', 'CONFIRMADO']);

export const CLOSED_RECEPTION_STATUSES = new Set<LeadStatus>([
  'CONVERTIDO',
  'NAO_COMPARECEU',
  'CANCELADO',
  'PERDIDO',
  'DUPLICADO',
  'INVALIDO',
  'DESCARTADO',
]);

export function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Não foi possível concluir a operação';
}

export function appointmentTime(lead: Pick<LeadDto, 'appointmentStartAt'>): number | null {
  if (!lead.appointmentStartAt) return null;
  const time = new Date(lead.appointmentStartAt).getTime();
  return Number.isNaN(time) ? null : time;
}

export function toIsoFromLocalInput(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function toLocalDateTimeInput(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function currentLocalDateTimeInput(): string {
  return toLocalDateTimeInput(new Date().toISOString());
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Sem horário';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Horário inválido';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export function timeOnly(value: string | null | undefined): string {
  if (!value) return '--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function dayLabel(value: string | null | undefined): string {
  if (!value) return 'Sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data inválida';
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (isSameDay(date, today)) return 'Hoje';
  if (isSameDay(date, tomorrow)) return 'Amanhã';

  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  }).format(date);
}

export function isToday(value: string | null | undefined): boolean {
  if (!value) return false;
  const date = new Date(value);
  return isSameDay(date, new Date());
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isPastAppointment(lead: LeadDto, now = Date.now()): boolean {
  if (!OPEN_APPOINTMENT_STATUSES.has(lead.status)) return false;
  const time = appointmentTime(lead);
  if (!time) return false;
  return now - time >= 15 * 60_000;
}

export function leadPriority(lead: LeadDto, now = Date.now()): number {
  if (lead.status === 'CLIENTE_CHEGOU') return 0;
  if (isPastAppointment(lead, now)) return 1;
  if (lead.nextFollowUpAt && new Date(lead.nextFollowUpAt).getTime() <= now) return 2;
  if (lead.status === 'NOVO') return 3;
  if (lead.appointmentStartAt && isToday(lead.appointmentStartAt)) return 4;
  return 5;
}

export function appointmentSummary(lead: Pick<LeadDto, 'appointmentStartAt' | 'appointmentEndAt'>): string {
  if (!lead.appointmentStartAt) return 'Sem agendamento';
  const end = lead.appointmentEndAt ? ` até ${timeOnly(lead.appointmentEndAt)}` : '';
  return `${formatDateTime(lead.appointmentStartAt)}${end}`;
}
