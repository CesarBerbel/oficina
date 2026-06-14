'use client';

import { useMemo, useState } from 'react';
import { CalendarClock, Clock, Filter, GripVertical, Lock, Trash2, UserCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { LEAD_STATUS_LABELS, type LeadDto } from '@oficina/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useTechnicians } from '@/features/service-orders/use-service-orders';
import { cn } from '@/lib/utils';
import { appointmentSummary, dayLabel, errorMessage, isPastAppointment, STATUS_VARIANT, timeOnly } from '../reception-utils';
import {
  useCreateReceptionScheduleBlock,
  useDeleteReceptionScheduleBlock,
  useReceptionScheduleBlocks,
  useScheduleLead,
} from '../use-leads';
import { WhatsAppNumberLink } from './whatsapp-number-link';

type AgendaGroup = {
  key: string;
  title: string;
  leads: LeadDto[];
};

type AgendaScope = 'hoje' | 'amanha' | 'semana' | 'atrasados' | 'todos';

type TechnicianColumn = {
  id: string;
  name: string;
};

const UNASSIGNED_TECHNICIAN_ID = '__sem_tecnico__';
const ALL_TECHNICIANS_ID = '__todos__';
const SLOT_START_HOUR = 8;
const SLOT_END_HOUR = 18;
const SLOT_MINUTES = 30;
const DAILY_CAPACITY_MINUTES = 8 * 60;

function appointmentDate(lead: LeadDto): Date | null {
  if (!lead.appointmentStartAt) return null;
  const date = new Date(lead.appointmentStartAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date): Date {
  const copy = startOfDay(date);
  copy.setDate(copy.getDate() + 1);
  return copy;
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

function localDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromLocalValue(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function localDateTime(dateValue: string, timeValue: string): Date {
  const [year, month, day] = dateValue.split('-').map(Number);
  const [hour, minute] = timeValue.split(':').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0, 0, 0);
}

function slotLabel(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function appointmentMinutes(lead: LeadDto): number {
  const start = lead.appointmentStartAt ? new Date(lead.appointmentStartAt).getTime() : 0;
  const end = lead.appointmentEndAt ? new Date(lead.appointmentEndAt).getTime() : start + SLOT_MINUTES * 60_000;
  const diff = Math.max(SLOT_MINUTES, Math.round((end - start) / 60_000));
  return Number.isFinite(diff) ? diff : SLOT_MINUTES;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function daySlots(dateValue: string): Date[] {
  const slots: Date[] = [];
  for (let hour = SLOT_START_HOUR; hour < SLOT_END_HOUR; hour += 1) {
    slots.push(localDateTime(dateValue, `${String(hour).padStart(2, '0')}:00`));
    slots.push(localDateTime(dateValue, `${String(hour).padStart(2, '0')}:30`));
  }
  return slots;
}

function leadTechnicianId(lead: LeadDto): string {
  return lead.assignedToId ?? UNASSIGNED_TECHNICIAN_ID;
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

function isInSlot(lead: LeadDto, slot: Date): boolean {
  const start = appointmentDate(lead);
  if (!start) return false;
  return start.getHours() === slot.getHours() && start.getMinutes() === slot.getMinutes();
}

function blockOverlapsSlot(block: { startAt: string; endAt: string }, slot: Date): boolean {
  const start = new Date(block.startAt).getTime();
  const end = new Date(block.endAt).getTime();
  const slotStart = slot.getTime();
  const slotEnd = addMinutes(slot, SLOT_MINUTES).getTime();
  return start < slotEnd && end > slotStart;
}

function technicianCapacity(leads: LeadDto[], technicianId: string): { minutes: number; percent: number } {
  const minutes = leads
    .filter((lead) => leadTechnicianId(lead) === technicianId)
    .reduce((sum, lead) => sum + appointmentMinutes(lead), 0);
  return { minutes, percent: Math.min(100, Math.round((minutes / DAILY_CAPACITY_MINUTES) * 100)) };
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
  const todayValue = localDateValue(new Date());
  const [scope, setScope] = useState<AgendaScope>('hoje');
  const [selectedDay, setSelectedDay] = useState(todayValue);
  const [technicianFilter, setTechnicianFilter] = useState(ALL_TECHNICIANS_ID);
  const [blockForm, setBlockForm] = useState({ technicianId: '', title: '', start: '12:00', end: '13:00', notes: '' });
  const { data: technicians } = useTechnicians();
  const scheduleLead = useScheduleLead();
  const createBlock = useCreateReceptionScheduleBlock();
  const deleteBlock = useDeleteReceptionScheduleBlock();

  const dayDate = dateFromLocalValue(selectedDay);
  const blocksQuery = useReceptionScheduleBlocks({
    from: startOfDay(dayDate).toISOString(),
    to: endOfDay(dayDate).toISOString(),
    technicianId: technicianFilter === ALL_TECHNICIANS_ID || technicianFilter === UNASSIGNED_TECHNICIAN_ID ? undefined : technicianFilter,
  });

  const technicianColumns = useMemo<TechnicianColumn[]>(() => {
    const columns = [
      { id: UNASSIGNED_TECHNICIAN_ID, name: 'Sem técnico' },
      ...((technicians ?? []).map((technician) => ({ id: technician.id, name: technician.name })) ?? []),
    ];
    if (technicianFilter === ALL_TECHNICIANS_ID) return columns;
    return columns.filter((column) => column.id === technicianFilter);
  }, [technicians, technicianFilter]);

  const filteredLeads = useMemo(() => filterAgenda(leads, scope), [leads, scope]);
  const groups = groupAgenda(filteredLeads);
  const selectedDayLeads = useMemo(
    () => leads.filter((lead) => lead.appointmentStartAt && isSameDay(new Date(lead.appointmentStartAt), dayDate)),
    [leads, dayDate],
  );
  const slots = useMemo(() => daySlots(selectedDay), [selectedDay]);
  const blocks = blocksQuery.data ?? [];
  const scopeOptions: Array<{ id: AgendaScope; label: string }> = [
    { id: 'hoje', label: 'Hoje' },
    { id: 'amanha', label: 'Amanhã' },
    { id: 'semana', label: '7 dias' },
    { id: 'atrasados', label: 'Atrasados' },
    { id: 'todos', label: 'Todos' },
  ];

  async function moveLead(leadId: string, slot: Date, technicianId: string) {
    const lead = leads.find((item) => item.id === leadId);
    if (!lead) return;
    const duration = appointmentMinutes(lead);
    try {
      await scheduleLead.mutateAsync({
        id: lead.id,
        input: {
          appointmentStartAt: slot.toISOString(),
          appointmentEndAt: addMinutes(slot, duration).toISOString(),
          appointmentServiceType: lead.appointmentServiceType ?? undefined,
          appointmentNotes: lead.appointmentNotes ?? undefined,
          assignedToId: technicianId === UNASSIGNED_TECHNICIAN_ID ? undefined : technicianId,
          clearAssignedTo: technicianId === UNASSIGNED_TECHNICIAN_ID,
        },
      });
      toast.success('Agendamento remarcado');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function submitBlock(event: React.FormEvent) {
    event.preventDefault();
    try {
      await createBlock.mutateAsync({
        technicianId: blockForm.technicianId || undefined,
        title: blockForm.title,
        startAt: localDateTime(selectedDay, blockForm.start).toISOString(),
        endAt: localDateTime(selectedDay, blockForm.end).toISOString(),
        notes: blockForm.notes || undefined,
      });
      setBlockForm((current) => ({ ...current, title: '', notes: '' }));
      toast.success('Bloqueio criado');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function removeBlock(id: string) {
    try {
      await deleteBlock.mutateAsync(id);
      toast.success('Bloqueio removido');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

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
              <p className="font-semibold">Agenda avançada da recepção</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Calendário por técnico, remarcação por arrastar e soltar, capacidade diária e bloqueios operacionais.
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0 rounded-xl border bg-background">
          <div className="grid gap-3 border-b p-3 lg:grid-cols-[12rem_1fr_14rem]">
            <div>
              <Label>Dia</Label>
              <Input type="date" value={selectedDay} onChange={(event) => setSelectedDay(event.target.value)} />
            </div>
            <div>
              <Label>Técnico</Label>
              <Select value={technicianFilter} onChange={(event) => setTechnicianFilter(event.target.value)}>
                <option value={ALL_TECHNICIANS_ID}>Todos os técnicos</option>
                <option value={UNASSIGNED_TECHNICIAN_ID}>Sem técnico</option>
                {(technicians ?? []).map((technician) => (
                  <option key={technician.id} value={technician.id}>{technician.name}</option>
                ))}
              </Select>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Capacidade base</p>
              <p>{DAILY_CAPACITY_MINUTES / 60}h por técnico/dia</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="grid min-w-[52rem]" style={{ gridTemplateColumns: `5rem repeat(${technicianColumns.length}, minmax(14rem, 1fr))` }}>
              <div className="sticky left-0 z-10 border-b bg-background p-2 text-xs font-medium text-muted-foreground">Horário</div>
              {technicianColumns.map((column) => {
                const capacity = technicianCapacity(selectedDayLeads, column.id);
                return (
                  <div key={column.id} className="border-b border-l bg-background p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{column.name}</p>
                      <Badge variant={capacity.percent >= 100 ? 'warning' : 'secondary'}>{capacity.percent}%</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{Math.round(capacity.minutes / 60)}h ocupadas</p>
                  </div>
                );
              })}

              {slots.map((slot) => (
                <div key={slot.toISOString()} className="contents">
                  <div className="sticky left-0 z-10 border-b bg-background p-2 text-xs font-medium text-muted-foreground">
                    {slotLabel(slot)}
                  </div>
                  {technicianColumns.map((column) => {
                    const slotLeads = selectedDayLeads.filter((lead) => leadTechnicianId(lead) === column.id && isInSlot(lead, slot));
                    const slotBlocks = blocks.filter(
                      (block) =>
                        blockOverlapsSlot(block, slot) &&
                        (block.technicianId === null || block.technicianId === (column.id === UNASSIGNED_TECHNICIAN_ID ? null : column.id)),
                    );
                    const blocked = slotBlocks.length > 0;
                    return (
                      <div
                        key={`${column.id}-${slot.toISOString()}`}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          const leadId = event.dataTransfer.getData('application/x-oficina-lead-id');
                          if (leadId && !blocked) void moveLead(leadId, slot, column.id);
                        }}
                        className={cn('min-h-24 border-b border-l p-2 transition', blocked ? 'bg-amber-50/60' : 'hover:bg-accent/50')}
                      >
                        {slotBlocks.map((block) => (
                          <div key={block.id} className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-semibold"><Lock className="mr-1 inline size-3" />{block.title}</p>
                              <button type="button" onClick={() => removeBlock(block.id)} className="text-amber-800 hover:text-foreground" title="Remover bloqueio">
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                            <p>{timeOnly(block.startAt)} até {timeOnly(block.endAt)}</p>
                            {block.notes && <p className="mt-1 text-amber-800">{block.notes}</p>}
                          </div>
                        ))}

                        {slotLeads.map((lead) => {
                          const late = isPastAppointment(lead);
                          return (
                            <div
                              key={lead.id}
                              draggable
                              onDragStart={(event) => event.dataTransfer.setData('application/x-oficina-lead-id', lead.id)}
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
                                'rounded-lg border bg-card p-2 text-xs shadow-sm transition hover:border-primary',
                                selectedId === lead.id && 'border-primary bg-primary/5',
                                late && 'border-amber-300 bg-amber-50',
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-semibold leading-tight">{lead.name}</p>
                                <GripVertical className="size-3.5 shrink-0 text-muted-foreground" />
                              </div>
                              <p className="mt-1 text-muted-foreground">{timeOnly(lead.appointmentStartAt)} até {timeOnly(lead.appointmentEndAt)}</p>
                              <p className="mt-1 truncate text-muted-foreground">{lead.appointmentServiceType || 'Atendimento'}</p>
                              <div className="mt-2 flex flex-wrap gap-1">
                                <Badge variant={STATUS_VARIANT[lead.status]}>{LEAD_STATUS_LABELS[lead.status]}</Badge>
                                {lead.plate && <Badge variant="outline">{lead.plate}</Badge>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <form onSubmit={submitBlock} className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2">
              <Lock className="size-4 text-primary" />
              <h3 className="font-semibold">Bloquear horário</h3>
            </div>
            <div className="mt-3 space-y-3">
              <div>
                <Label>Motivo</Label>
                <Input value={blockForm.title} onChange={(event) => setBlockForm((current) => ({ ...current, title: event.target.value }))} placeholder="Almoço, treinamento, entrega externa..." />
              </div>
              <div>
                <Label>Técnico</Label>
                <Select value={blockForm.technicianId} onChange={(event) => setBlockForm((current) => ({ ...current, technicianId: event.target.value }))}>
                  <option value="">Bloqueio geral</option>
                  {(technicians ?? []).map((technician) => (
                    <option key={technician.id} value={technician.id}>{technician.name}</option>
                  ))}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Início</Label>
                  <Input type="time" value={blockForm.start} onChange={(event) => setBlockForm((current) => ({ ...current, start: event.target.value }))} />
                </div>
                <div>
                  <Label>Fim</Label>
                  <Input type="time" value={blockForm.end} onChange={(event) => setBlockForm((current) => ({ ...current, end: event.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Observação</Label>
                <Textarea value={blockForm.notes} onChange={(event) => setBlockForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Opcional" />
              </div>
            </div>
            <Button className="mt-3 w-full" disabled={createBlock.isPending}>Criar bloqueio</Button>
          </form>

          <div className="rounded-xl border bg-card p-4">
            <h3 className="font-semibold">Agenda agrupada</h3>
            <p className="mt-1 text-xs text-muted-foreground">Resumo por período para conferência rápida.</p>
            <div className="mt-3 space-y-3">
              {groups.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Nenhum atendimento no filtro.</p>
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
                      {group.leads.slice(0, 6).map((lead) => {
                        const late = isPastAppointment(lead);
                        return (
                          <button
                            key={lead.id}
                            type="button"
                            onClick={() => onSelect(lead.id)}
                            className={cn('grid w-full gap-2 p-3 text-left transition hover:bg-accent', selectedId === lead.id && 'bg-primary/5')}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium">{timeOnly(lead.appointmentStartAt)} · {lead.name}</p>
                              {lead.status === 'CLIENTE_CHEGOU' ? (
                                <UserCheck className="size-3.5 text-emerald-700" />
                              ) : late ? (
                                <Clock className="size-3.5 text-amber-700" />
                              ) : (
                                <Clock className="size-3.5 text-muted-foreground" />
                              )}
                            </div>
                            <p className="truncate text-xs text-muted-foreground">{appointmentSummary(lead)}</p>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <WhatsAppNumberLink value={lead.phone} showIcon onClick={(event) => event.stopPropagation()} />
                              {lead.plate && <span>Placa: {lead.plate}</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
