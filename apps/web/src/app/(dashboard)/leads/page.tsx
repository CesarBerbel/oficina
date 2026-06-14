'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Mail,
  Phone,
  Search,
  Wrench,
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
  type LeadConflictLevel,
  type LeadContactChannel,
  type LeadContactOutcome,
  type LeadStatus,
} from '@oficina/shared';
import { CarLoader } from '@/components/car-loader';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCustomers } from '@/features/customers/use-customers';
import {
  useConvertLeadToServiceOrder,
  useLead,
  useLeads,
  useLinkLeadCustomer,
  useLinkLeadVehicle,
  useRegisterLeadContact,
  useUpdateLeadStatus,
} from '@/features/content/use-content';
import { useTechnicians } from '@/features/service-orders/use-service-orders';
import { useVehicles } from '@/features/vehicles/use-vehicles';
import { ApiError } from '@/lib/api';
import { maskPhone } from '@/lib/masks';
import { cn, formatDate } from '@/lib/utils';

const STATUS_VARIANT: Record<LeadStatus, BadgeProps['variant']> = {
  NOVO: 'default',
  EM_ATENDIMENTO: 'warning',
  CONTATO_REALIZADO: 'outline',
  RETORNAR_DEPOIS: 'warning',
  AGENDADO: 'success',
  CONVERTIDO: 'success',
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

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Não foi possível concluir a operação';
}

function toIsoFromLocalInput(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export default function LeadsPage() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const { data, isLoading } = useLeads({
    page: 1,
    pageSize: 80,
    status: (status || undefined) as LeadStatus | undefined,
    search: search || undefined,
  });
  const leads = data?.data ?? [];

  useEffect(() => {
    if (!selectedId && leads[0]) setSelectedId(leads[0].id);
    if (selectedId && leads.length > 0 && !leads.some((lead) => lead.id === selectedId)) {
      setSelectedId(leads[0]?.id);
    }
  }, [leads, selectedId]);

  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-[22rem_1fr]">
      <aside className="min-h-0 rounded-xl border bg-card">
        <div className="border-b p-4">
          <h1 className="text-2xl font-bold tracking-tight">Central de Pré-atendimento</h1>
          <p className="text-sm text-muted-foreground">
            Triagem dos contatos recebidos pelo site antes de virar cliente, veículo e OS.
          </p>
          <div className="mt-4 space-y-2">
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

        <div className="max-h-[calc(100dvh-15rem)] overflow-y-auto p-2">
          {isLoading ? (
            <div className="grid h-40 place-items-center">
              <CarLoader className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : leads.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhum pré-atendimento encontrado.
            </p>
          ) : (
            <div className="space-y-2">
              {leads.map((lead) => (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => setSelectedId(lead.id)}
                  className={cn(
                    'w-full rounded-lg border p-3 text-left transition hover:bg-accent',
                    selectedId === lead.id && 'border-primary bg-primary/5',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{lead.name}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(lead.createdAt)}</p>
                    </div>
                    <Badge variant={STATUS_VARIANT[lead.status]}>
                      {LEAD_STATUS_LABELS[lead.status]}
                    </Badge>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <p className="flex items-center gap-1.5">
                      <Phone className="size-3" /> {maskPhone(lead.phone)}
                    </p>
                    {lead.plate && <p>Placa: {lead.plate}</p>}
                    {lead.vehicle && <p className="truncate">Veículo: {lead.vehicle}</p>}
                    {lead.nextFollowUpAt && (
                      <p className="flex items-center gap-1.5 text-amber-700">
                        <CalendarClock className="size-3" /> Retorno: {formatDate(lead.nextFollowUpAt)}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      <LeadDetailPanel id={selectedId} />
    </div>
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
      notes: `Criado a partir do pré-atendimento ${lead.id}`,
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
    setContact({ channel: 'TELEFONE', outcome: 'ATENDEU', notes: '', nextFollowUpAt: '' });
  }, [lead]);

  const vehicleOptions = useMemo(() => vehicles?.data ?? [], [vehicles]);

  if (!id) {
    return (
      <section className="grid min-h-[22rem] place-items-center rounded-xl border bg-card p-8 text-center text-muted-foreground">
        Selecione um pré-atendimento para começar a triagem.
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

  const activeLead = lead;

  async function changeStatus(statusValue: LeadStatus) {
    try {
      await updateStatus.mutateAsync({ id: activeLead.id, status: statusValue });
      toast.success('Status atualizado');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function submitContact(event: React.FormEvent) {
    event.preventDefault();
    try {
      await registerContact.mutateAsync({
        id: activeLead.id,
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

  async function submitLinkCustomer(targetCustomerId: string) {
    try {
      await linkCustomer.mutateAsync({ id: activeLead.id, input: { customerId: targetCustomerId } });
      toast.success('Cliente vinculado');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function submitLinkVehicle(targetVehicleId: string) {
    try {
      await linkVehicle.mutateAsync({ id: activeLead.id, input: { vehicleId: targetVehicleId } });
      toast.success('Veículo vinculado');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function submitConversion(event: React.FormEvent) {
    event.preventDefault();
    try {
      await convertLead.mutateAsync({
        id: activeLead.id,
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
      toast.success('Pré-atendimento convertido em OS');
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
          <p className="mt-1 text-sm text-muted-foreground">Recebido em {formatDate(lead.createdAt)}</p>
        </div>
        <Select value={lead.status} onChange={(event) => changeStatus(event.target.value as LeadStatus)} className="w-full sm:w-56">
          {LEAD_STATUSES.map((item) => (
            <option key={item} value={item}>{LEAD_STATUS_LABELS[item]}</option>
          ))}
        </Select>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <h3 className="font-semibold">Dados enviados pelo site</h3>
            <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              <p className="flex items-center gap-2"><Phone className="size-4" /> {maskPhone(lead.phone)}</p>
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
                      <p className="text-xs text-muted-foreground">{customer.phone ? maskPhone(customer.phone) : customer.email}</p>
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
          <form onSubmit={submitContact} className="rounded-xl border bg-card p-4">
            <h3 className="font-semibold">Registrar contato telefônico</h3>
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
                  <div><Label>E-mail</Label><Input value={newCustomer.email} onChange={(event) => setNewCustomer((cur) => ({ ...cur, email: event.target.value }))} /></div>
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
                  <p className="text-xs text-muted-foreground">{formatDate(attempt.createdAt)} · {attempt.userName ?? 'Sistema'}</p>
                  {attempt.notes && <p className="mt-2 whitespace-pre-wrap">{attempt.notes}</p>}
                  {attempt.nextFollowUpAt && <p className="mt-2 text-amber-700">Retorno: {formatDate(attempt.nextFollowUpAt)}</p>}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h3 className="font-semibold">Timeline do pré-atendimento</h3>
          <div className="mt-3 space-y-3">
            {lead.events.map((event) => (
              <div key={event.id} className="border-l-2 border-primary/30 pl-3 text-sm">
                <p className="font-medium">{event.title}</p>
                <p className="text-xs text-muted-foreground">{formatDate(event.createdAt)} · {event.userName ?? 'Sistema'}</p>
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
