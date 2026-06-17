'use client';

import { useState } from 'react';
import { UserCheck, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import type { CreateDirectReceptionLeadInput, LeadDetailDto } from '@oficina/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { maskPhone } from '@/lib/masks';
import { useCreateDirectReceptionLead } from '../use-leads';
import { errorMessage } from '../reception-utils';

const DIRECT_RECEPTION_INITIAL_FORM = {
  name: '',
  phone: '',
  email: '',
  plate: '',
  vehicle: '',
  message: '',
  appointmentServiceType: 'Atendimento presencial',
  appointmentNotes: '',
};

export function DirectReceptionDialog({ onCreated }: { onCreated: (lead: LeadDetailDto) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DIRECT_RECEPTION_INITIAL_FORM);
  const createDirectReception = useCreateDirectReceptionLead();

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetAndClose() {
    setOpen(false);
    setForm(DIRECT_RECEPTION_INITIAL_FORM);
  }

  async function submitDirectReception(event: React.FormEvent) {
    event.preventDefault();

    const input: CreateDirectReceptionLeadInput = {
      name: form.name,
      phone: form.phone,
      email: form.email || undefined,
      plate: form.plate || undefined,
      vehicle: form.vehicle || undefined,
      message: form.message || 'Cliente recebido direto na oficina.',
      appointmentServiceType: form.appointmentServiceType || undefined,
      appointmentNotes: form.appointmentNotes || undefined,
    };

    try {
      const created = await createDirectReception.mutateAsync(input);
      toast.success('Cliente recebido na oficina');
      onCreated(created);
      resetAndClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setForm(DIRECT_RECEPTION_INITIAL_FORM);
      }}
    >
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" /> Receber direto
      </Button>
      <DialogContent className="max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receber cliente direto na oficina</DialogTitle>
          <DialogDescription>
            Use quando o cliente chegou sem atendimento anterior. O sistema cria o atendimento
            presencial já como “Cliente chegou”, com agenda marcada para agora e pronto para
            converter em OS.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submitDirectReception} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Nome do cliente</Label>
              <Input
                value={form.name}
                onChange={(event) => update('name', event.target.value)}
                required
                minLength={2}
              />
            </div>
            <div>
              <Label>Telefone / WhatsApp</Label>
              <Input
                value={form.phone}
                onChange={(event) => update('phone', maskPhone(event.target.value))}
                required
                minLength={8}
              />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(event) => update('email', event.target.value)}
              />
            </div>
            <div>
              <Label>Placa</Label>
              <Input
                value={form.plate}
                onChange={(event) => update('plate', event.target.value.toUpperCase())}
                placeholder="ABC1D23"
              />
            </div>
            <div>
              <Label>Veículo</Label>
              <Input
                value={form.vehicle}
                onChange={(event) => update('vehicle', event.target.value)}
                placeholder="Ex.: Gol 1.0 2018"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Tipo de atendimento</Label>
              <Input
                value={form.appointmentServiceType}
                onChange={(event) => update('appointmentServiceType', event.target.value)}
                placeholder="Ex.: diagnóstico, revisão, retorno, garantia..."
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Problema relatado</Label>
              <Textarea
                value={form.message}
                onChange={(event) => update('message', event.target.value)}
                required
                minLength={3}
                placeholder="Ex.: cliente chegou relatando barulho na suspensão..."
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Observação interna da recepção</Label>
              <Textarea
                value={form.appointmentNotes}
                onChange={(event) => update('appointmentNotes', event.target.value)}
                placeholder="Ex.: veículo já está no pátio, aguardando abertura da OS."
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={resetAndClose}>
              Cancelar
            </Button>
            <Button disabled={createDirectReception.isPending}>
              <UserCheck className="size-4" /> Receber e abrir jornada
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
