'use client';

import { use, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';
import {
  CalendarClock,
  Car,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Copy,
  DollarSign,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  ReceiptText,
  Sparkles,
  TrendingUp,
  UserRound,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  CUSTOMER_TYPE_LABELS,
  QUOTE_STATUS_LABELS,
  SERVICE_ORDER_STATUS_LABELS,
  type Customer360Dto,
} from '@oficina/shared';
import { CarLoader } from '@/components/car-loader';
import { BackButton } from '@/components/back-button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CustomerFormDialog } from '@/features/customers/customer-form-dialog';
import { useCustomer360 } from '@/features/customers/use-customers';
import { VehicleFormDialog } from '@/features/vehicles/vehicle-form-dialog';
import { useAuth } from '@/lib/auth-context';
import { maskCpfCnpj, maskPhone } from '@/lib/masks';
import { cn, formatCurrency, formatDate } from '@/lib/utils';

const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  ENTRADA: 'default',
  DIAGNOSTICO_PRONTO: 'warning',
  ORCAMENTO: 'warning',
  ORCAMENTO_APROVADO: 'success',
  ORCAMENTO_RECUSADO: 'destructive',
  AGUARDANDO_PECA: 'warning',
  EM_EXECUCAO: 'default',
  EM_TESTE: 'outline',
  PRONTA: 'success',
  PRONTO_RETIRAR: 'success',
  ENTREGUE: 'secondary',
  CANCELADA: 'destructive',
};

const PRIORITY_VARIANT: Record<string, BadgeProps['variant']> = {
  alta: 'destructive',
  media: 'warning',
  baixa: 'secondary',
};

const TIMELINE_ICON = {
  CUSTOMER: UserRound,
  VEHICLE: Car,
  LEAD: MessageSquare,
  SERVICE_ORDER: ClipboardList,
  QUOTE: ReceiptText,
  CHECKIN: ClipboardCheck,
  MESSAGE: MessageCircle,
  CRM: Sparkles,
} satisfies Record<Customer360Dto['timeline'][number]['type'], typeof UserRound>;

function whatsappHref(phone: string | null, message?: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  const normalized = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${normalized}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('customers:write');
  const canVehicle = hasPermission('vehicles:write');
  const { data, isLoading } = useCustomer360(id);
  const [editOpen, setEditOpen] = useState(false);
  const [vehicleOpen, setVehicleOpen] = useState(false);

  const customer = data?.customer;
  const address = useMemo(() => {
    if (!customer) return '';
    return [
      customer.street,
      customer.number,
      customer.district,
      customer.city && `${customer.city}${customer.state ? '/' + customer.state : ''}`,
    ]
      .filter(Boolean)
      .join(', ');
  }, [customer]);

  if (isLoading) {
    return (
      <div className="grid h-64 place-items-center">
        <CarLoader className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || !customer) {
    return <p className="text-muted-foreground">Cliente não encontrado.</p>;
  }

  const contactPhone = customer.whatsapp || customer.phone;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <BackButton fallbackHref="/clientes" iconOnly />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">Cliente 360° · {customer.name}</h1>
              <Badge variant="secondary">{CUSTOMER_TYPE_LABELS[customer.type]}</Badge>
            </div>
            <p className="mt-1 text-muted-foreground">
              Visão unificada de dados, veículos, OS, orçamentos, recepção, CRM e histórico.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {customer.categories.map((cat) => (
                <Badge key={cat}>{cat}</Badge>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {contactPhone ? (
            <Button asChild variant="outline">
              <a href={whatsappHref(contactPhone) ?? '#'} target="_blank" rel="noreferrer">
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            </Button>
          ) : null}
          {canWrite ? (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" /> Editar cliente
            </Button>
          ) : null}
          {canVehicle ? (
            <Button onClick={() => setVehicleOpen(true)}>
              <Plus className="size-4" /> Veículo
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi icon={Car} label="Veículos" value={data.kpis.vehicles} />
        <Kpi icon={ClipboardList} label="OS abertas" value={data.kpis.openServiceOrders} tone="warning" />
        <Kpi icon={CheckCircle2} label="OS entregues" value={data.kpis.deliveredServiceOrders} tone="success" />
        <Kpi icon={DollarSign} label="Total vendido" value={formatCurrency(data.kpis.totalSpent)} />
        <Kpi icon={TrendingUp} label="Ticket médio" value={formatCurrency(data.kpis.averageTicket)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px,1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><UserRound className="size-5" /> Dados e contato</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Info label="Documento" value={customer.document ? maskCpfCnpj(customer.document) : null} />
              <Info icon={Phone} label="Telefone" value={customer.phone ? maskPhone(customer.phone) : null} />
              <Info icon={MessageCircle} label="WhatsApp" value={customer.whatsapp ? maskPhone(customer.whatsapp) : null} />
              <Info icon={Mail} label="E-mail" value={customer.email} />
              <Info icon={MapPin} label="Endereço" value={address || null} />
              <Info icon={Clock} label="Última visita" value={data.kpis.lastVisitAt ? formatDate(data.kpis.lastVisitAt) : null} />
              {customer.notes ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Observações</p>
                  <p className="whitespace-pre-wrap">{customer.notes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Sparkles className="size-5" /> CRM ativo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.crmOpportunities.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma oportunidade ativa para este cliente.</p>
              ) : (
                data.crmOpportunities.slice(0, 6).map((item) => (
                  <div key={item.key} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={PRIORITY_VARIANT[item.priority] ?? 'secondary'}>{item.priority}</Badge>
                      <p className="font-medium">{item.title}</p>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
                    {item.vehicleLabel ? (
                      <p className="mt-1 text-xs text-muted-foreground">{item.vehicleLabel}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {contactPhone ? (
                        <Button asChild size="sm" variant="outline">
                          <a href={whatsappHref(contactPhone, item.suggestedMessage) ?? '#'} target="_blank" rel="noreferrer">
                            <MessageCircle className="size-4" /> Enviar
                          </a>
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          navigator.clipboard.writeText(item.suggestedMessage);
                          toast.success('Mensagem copiada');
                        }}
                      >
                        <Copy className="size-4" /> Copiar
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2"><Car className="size-5" /> Veículos</CardTitle>
              <Badge variant="secondary">{data.vehicles.length}</Badge>
            </CardHeader>
            <CardContent>
              {data.vehicles.length === 0 ? (
                <EmptyState>Nenhum veículo cadastrado.</EmptyState>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {data.vehicles.map((vehicle) => (
                    <Link
                      key={vehicle.id}
                      href={`/veiculos?search=${encodeURIComponent(vehicle.plate)}`}
                      className="rounded-lg border p-4 transition-colors hover:bg-accent"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold">{vehicle.manufacturer} {vehicle.model}</p>
                          <p className="text-sm text-muted-foreground">
                            {vehicle.modelYear ? `${vehicle.modelYear} · ` : ''}{vehicle.color ?? 'Cor não informada'}
                          </p>
                        </div>
                        <Badge variant="outline">{vehicle.plate}</Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <span>{vehicle.currentKm != null ? `${vehicle.currentKm.toLocaleString('pt-BR')} km` : 'KM não informado'}</span>
                        <span>{vehicle.serviceOrdersCount} OS</span>
                        <span className="col-span-2">
                          Último serviço: {vehicle.lastServiceOrderAt ? formatDate(vehicle.lastServiceOrderAt) : 'sem histórico'}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ClipboardList className="size-5" /> Ordens de Serviço recentes</CardTitle>
            </CardHeader>
            <CardContent>
              {data.serviceOrders.length === 0 ? (
                <EmptyState>Nenhuma OS encontrada para este cliente.</EmptyState>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>OS</TableHead>
                      <TableHead>Veículo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Atualizada</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.serviceOrders.slice(0, 12).map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>
                          <Link href={`/os/${order.id}`} className="font-medium text-primary hover:underline">
                            #{order.number}
                          </Link>
                          <p className="line-clamp-1 text-xs text-muted-foreground">{order.reportedProblem}</p>
                        </TableCell>
                        <TableCell>
                          <p>{order.vehiclePlate}</p>
                          <p className="text-xs text-muted-foreground">{order.vehicleLabel}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[order.status] ?? 'secondary'}>
                            {SERVICE_ORDER_STATUS_LABELS[order.status as keyof typeof SERVICE_ORDER_STATUS_LABELS] ?? order.status}
                          </Badge>
                          {order.quoteStatus ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Orçamento: {QUOTE_STATUS_LABELS[order.quoteStatus as keyof typeof QUOTE_STATUS_LABELS] ?? order.quoteStatus}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell>{formatCurrency(order.total)}</TableCell>
                        <TableCell>{formatDate(order.updatedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <MiniList
              icon={MessageSquare}
              title="Recepção e atendimentos"
              count={data.leads.length}
              empty="Nenhum atendimento vinculado."
            >
              {data.leads.slice(0, 6).map((lead) => (
                <Link key={lead.id} href={`/leads?search=${encodeURIComponent(lead.name)}`} className="block rounded-lg border p-3 hover:bg-accent">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{lead.status}</p>
                    {lead.appointmentStartAt ? <Badge variant="outline">{formatDate(lead.appointmentStartAt)}</Badge> : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{lead.message}</p>
                </Link>
              ))}
            </MiniList>

            <MiniList
              icon={ReceiptText}
              title="Orçamentos"
              count={data.quotes.length}
              empty="Nenhum orçamento gerado."
            >
              {data.quotes.slice(0, 6).map((quote) => (
                <Link key={quote.id} href={`/os/${quote.serviceOrderId}`} className="block rounded-lg border p-3 hover:bg-accent">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">OS #{quote.serviceOrderNumber}</p>
                    <Badge variant="outline">{QUOTE_STATUS_LABELS[quote.status as keyof typeof QUOTE_STATUS_LABELS] ?? quote.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{formatCurrency(quote.total)} · {formatDate(quote.createdAt)}</p>
                </Link>
              ))}
            </MiniList>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><CalendarClock className="size-5" /> Linha do tempo unificada</CardTitle>
            </CardHeader>
            <CardContent>
              {data.timeline.length === 0 ? (
                <EmptyState>Sem eventos para exibir.</EmptyState>
              ) : (
                <div className="space-y-3">
                  {data.timeline.slice(0, 30).map((item, index) => {
                    const Icon = TIMELINE_ICON[item.type];
                    const content = (
                      <div className="flex gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50">
                        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{item.title}</p>
                            <Badge variant="secondary">{formatDate(item.occurredAt)}</Badge>
                          </div>
                          {item.description ? (
                            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
                          ) : null}
                        </div>
                      </div>
                    );
                    return item.href ? (
                      <Link key={`${item.id}-${index}`} href={item.href}>{content}</Link>
                    ) : (
                      <div key={`${item.id}-${index}`}>{content}</div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <CustomerFormDialog open={editOpen} onOpenChange={setEditOpen} customer={customer} />
      <VehicleFormDialog
        open={vehicleOpen}
        onOpenChange={setVehicleOpen}
        lockedCustomerId={customer.id}
        lockedCustomerName={customer.name}
      />
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: typeof Car;
  label: string;
  value: string | number;
  tone?: 'default' | 'warning' | 'success';
}) {
  const toneClass = {
    default: 'bg-primary/10 text-primary',
    warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    success: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  }[tone];

  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
        </div>
        <span className={cn('flex size-10 items-center justify-center rounded-lg', toneClass)}>
          <Icon className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}

function Info({
  icon: Icon,
  label,
  value,
}: {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      {Icon ? <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : null}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p>{value}</p>
      </div>
    </div>
  );
}

function MiniList({
  icon: Icon,
  title,
  count,
  empty,
  children,
}: {
  icon: typeof Wrench;
  title: string;
  count: number;
  empty: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2"><Icon className="size-5" /> {title}</CardTitle>
        <Badge variant="secondary">{count}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {count === 0 ? <EmptyState>{empty}</EmptyState> : children}
      </CardContent>
    </Card>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
