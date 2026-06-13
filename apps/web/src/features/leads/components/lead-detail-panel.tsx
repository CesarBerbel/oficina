'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Mail,
  MessageCircle,
  Phone,
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
  type LeadContactChannel,
  type LeadContactOutcome,
  type LeadStatus,
} from '@oficina/shared';
import { CarLoader } from '@/components/car-loader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  useConvertLeadToServiceOrder,
  useLead,
  useLinkLeadCustomer,
  useLinkLeadVehicle,
  useNoShowLead,
  useRegisterLeadContact,
  useScheduleLead,
  useUpdateLeadStatus,
} from '@/features/leads/use-leads';
import { useTechnicians } from '@/features/service-orders/use-service-orders';
import { useVehicles } from '@/features/vehicles/use-vehicles';
import { maskPhone } from '@/lib/masks';
import { cn } from '@/lib/utils';
import {
  CLOSED_RECEPTION_STATUSES,
  CONFLICT_VARIANT,
  OPEN_APPOINTMENT_STATUSES,
  STATUS_VARIANT,
  appointmentSummary,
  currentLocalDateTimeInput,
  errorMessage,
  formatDateTime,
  toIsoFromLocalInput,
  toLocalDateTimeInput,
} from '../reception-utils';
import { WhatsAppNumberLink } from './whatsapp-number-link';

export function LeadDetailPanel({ id }: { id?: string }) {
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
