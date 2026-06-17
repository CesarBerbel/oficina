'use client';

import { useEffect, useState } from 'react';

import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import {
  createTemplateSchema,
  updateTemplateSchema,
  MESSAGE_EVENTS,
  MESSAGE_EVENT_LABELS,
  MESSAGE_CHANNELS,
  MESSAGE_CHANNEL_LABELS,
  MESSAGE_VARIABLES,
  type MessageTemplateDto,
} from '@oficina/shared';
import { apiErrorMessage, zodFieldErrors } from '@/lib/form-errors';
import { AiAssistButton } from '@/features/ai/ai-assist-button';
import { useCreateTemplate, useUpdateTemplate } from './use-messaging';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const empty = {
  name: '',
  event: 'MANUAL',
  channel: 'WHATSAPP',
  body: '',
  active: true,
  autoSend: false,
};

const FIELD_LABELS = {
  name: 'Nome',
  event: 'Evento',
  channel: 'Canal',
  body: 'Mensagem',
};

export function TemplateFormDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  template?: MessageTemplateDto | null;
}) {
  const isEdit = !!template;
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateTemplate();
  const update = useUpdateTemplate(template?.id ?? '');
  const pending = create.isPending || update.isPending;

  useEffect(() => {
    if (!open) return;
    setForm(
      template
        ? {
            name: template.name,
            event: template.event,
            channel: template.channel,
            body: template.body,
            active: template.active,
            autoSend: template.autoSend,
          }
        : empty,
    );
    setErrors({});
  }, [open, template]);

  function set<K extends keyof typeof empty>(k: K, v: string | boolean) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const schema = isEdit ? updateTemplateSchema : createTemplateSchema;
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error, FIELD_LABELS));
      return;
    }
    try {
      if (isEdit) {
        await update.mutateAsync(parsed.data);
        toast.success('Template atualizado');
      } else {
        await create.mutateAsync(parsed.data as never);
        toast.success('Template criado');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, FIELD_LABELS));
    }
  }

  function insertVar(token: string) {
    setForm((f) => ({ ...f, body: f.body + token }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar template' : 'Novo template'}</DialogTitle>
          <DialogDescription>Mensagem por evento e canal, com variáveis.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label required>Nome</Label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>Evento</Label>
              <Select
                value={form.event}
                onChange={(e) => set('event', e.target.value)}
                className="w-full"
              >
                {MESSAGE_EVENTS.map((ev) => (
                  <option key={ev} value={ev}>
                    {MESSAGE_EVENT_LABELS[ev]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label required>Canal</Label>
              <Select
                value={form.channel}
                onChange={(e) => set('channel', e.target.value)}
                className="w-full"
              >
                {MESSAGE_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {MESSAGE_CHANNEL_LABELS[c]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label required>Mensagem</Label>
              <AiAssistButton
                field="message_body"
                instruction={`Escreva uma mensagem curta e cordial de oficina para o cliente referente ao evento "${form.event}", usando variáveis como {{cliente.nome}}, {{os.numero}} e {{os.link}} quando fizer sentido.`}
                content={form.body}
                onResult={(text) => set('body', text)}
              />
            </div>
            <Textarea value={form.body} onChange={(e) => set('body', e.target.value)} rows={4} />
            {errors.body && <p className="text-xs text-destructive">{errors.body}</p>}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {MESSAGE_VARIABLES.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  onClick={() => insertVar(v.token)}
                  title={v.description}
                  className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-accent"
                >
                  {v.token}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={form.active}
                onChange={(e) => set('active', e.target.checked)}
              />{' '}
              Ativo
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={form.autoSend}
                onChange={(e) => set('autoSend', e.target.checked)}
              />{' '}
              Envio automático no evento
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <CarLoader className="size-4 animate-spin" />}
              {isEdit ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
