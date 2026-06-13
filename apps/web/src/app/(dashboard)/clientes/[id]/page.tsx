'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import {
  Pencil, Plus, Phone, Mail, MapPin, Car, ClipboardList, MessageSquare } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import {
  CUSTOMER_TYPE_LABELS,
  FUEL_TYPE_LABELS,
  type FuelType,
} from '@oficina/shared';
import { useAuth } from '@/lib/auth-context';
import { buildWhatsAppHref } from '@/lib/contact-links';
import { maskCpfCnpj, maskPhone } from '@/lib/masks';
import { useCustomer } from '@/features/customers/use-customers';
import { CustomerFormDialog } from '@/features/customers/customer-form-dialog';
import { useVehicles } from '@/features/vehicles/use-vehicles';
import { VehicleFormDialog } from '@/features/vehicles/vehicle-form-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BackButton } from '@/components/back-button';

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('customers:write');
  const canVehicle = hasPermission('vehicles:write');

  const { data: customer, isLoading } = useCustomer(id);
  const { data: vehiclesData } = useVehicles({ customerId: id, pageSize: 100 });
  const [editOpen, setEditOpen] = useState(false);
  const [vehicleOpen, setVehicleOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="grid h-64 place-items-center">
        <CarLoader className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!customer) {
    return <p className="text-muted-foreground">Cliente não encontrado.</p>;
  }

  const vehicles = vehiclesData?.data ?? [];
  const whatsappHref = buildWhatsAppHref(customer.whatsapp);
  const address = [
    customer.street,
    customer.number,
    customer.district,
    customer.city && `${customer.city}${customer.state ? '/' + customer.state : ''}`,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BackButton fallbackHref="/clientes" iconOnly />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{customer.name}</h1>
            <div className="mt-1 flex flex-wrap gap-2">
              <Badge variant="secondary">{CUSTOMER_TYPE_LABELS[customer.type]}</Badge>
              {customer.categories.map((cat) => (
                <Badge key={cat}>{cat}</Badge>
              ))}
            </div>
          </div>
        </div>
        {canWrite && (
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" /> Editar
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Dados */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Dados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Info label="Documento" value={customer.document ? maskCpfCnpj(customer.document) : null} />
            <Info icon={Phone} label="Telefone" value={customer.phone ? maskPhone(customer.phone) : null} />
            <Info
              icon={Phone}
              label="WhatsApp"
              value={
                whatsappHref && customer.whatsapp ? (
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary hover:underline"
                  >
                    {maskPhone(customer.whatsapp)}
                  </a>
                ) : null
              }
            />
            <Info icon={Mail} label="E-mail" value={customer.email} />
            <Info icon={MapPin} label="Endereço" value={address || null} />
            {customer.notes && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Observações</p>
                <p className="whitespace-pre-wrap">{customer.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Veículos + históricos */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2">
                <Car className="size-5" /> Veículos ({vehicles.length})
              </CardTitle>
              {canVehicle && (
                <Button size="sm" onClick={() => setVehicleOpen(true)}>
                  <Plus className="size-4" /> Adicionar
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {vehicles.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum veículo cadastrado.
                </p>
              ) : (
                <div className="divide-y">
                  {vehicles.map((v) => (
                    <Link
                      key={v.id}
                      href={`/veiculos?customerId=${customer.id}`}
                      className="flex items-center justify-between gap-2 py-3 first:pt-0 last:pb-0 hover:bg-accent/40"
                    >
                      <div>
                        <p className="font-medium">
                          {v.manufacturer} {v.model}
                          {v.modelYear ? ` · ${v.modelYear}` : ''}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {v.plate}
                          {v.fuel ? ` · ${FUEL_TYPE_LABELS[v.fuel as FuelType]}` : ''}
                          {v.currentKm != null ? ` · ${v.currentKm.toLocaleString('pt-BR')} km` : ''}
                        </p>
                      </div>
                      <Badge variant="outline">{v.plate}</Badge>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <HistoryPlaceholder icon={ClipboardList} title="Histórico de OS" phase="Fase 3" />
            <HistoryPlaceholder icon={MessageSquare} title="Histórico de mensagens" phase="Fase 8" />
          </div>
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

function Info({
  icon: Icon,
  label,
  value,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode | null;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      {Icon && <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p>{value}</p>
      </div>
    </div>
  );
}

function HistoryPlaceholder({
  icon: Icon,
  title,
  phase,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  phase: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <Icon className="size-6" />
        <p className="font-medium text-foreground">{title}</p>
        <Badge variant="secondary">{phase}</Badge>
      </CardContent>
    </Card>
  );
}
