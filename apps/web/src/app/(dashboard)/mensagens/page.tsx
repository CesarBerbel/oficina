'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, Send, Mail } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import {
  MESSAGE_EVENT_LABELS,
  MESSAGE_CHANNEL_LABELS,
  MESSAGE_CHANNELS,
  MESSAGE_STATUS_LABELS,
  sendMessageSchema,
  type MessageTemplateDto,
} from '@oficina/shared';
import { ApiError } from '@/lib/api';
import { apiErrorMessage, zodFieldErrors } from '@/lib/form-errors';
import { maskPhoneOrEmail } from '@/lib/masks';
import { useAuth } from '@/lib/auth-context';
import {
  useTemplates, useDeleteTemplate, useMessageLogs, useSendMessage, useSendTestEmail, useMailStatus,
} from '@/features/messaging/use-messaging';
import { TemplateFormDialog } from '@/features/messaging/template-form-dialog';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { formatDate, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

const SEND_FIELD_LABELS = {
  channel: 'Canal',
  to: 'Destinatário',
  body: 'Mensagem',
};

export default function MessagesPage() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('messages:write');
  const [tab, setTab] = useState<'templates' | 'historico'>('templates');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mensagens</h1>
        <p className="text-muted-foreground">Templates e histórico de envios.</p>
      </div>

      <MailStatusBanner />

      <div className="flex gap-1 border-b">
        {(['templates', 'historico'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize transition-colors',
              tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {t === 'historico' ? 'Histórico' : 'Templates'}
          </button>
        ))}
      </div>

      {tab === 'templates' ? <TemplatesTab canWrite={canWrite} /> : <HistoricoTab canWrite={canWrite} />}
    </div>
  );
}

function MailStatusBanner() {
  const { data } = useMailStatus();
  if (!data) return null;

  if (data.mode === 'smtp') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
        <Mail className="size-4 shrink-0" />
        <span>
          Envio de e-mail <strong>ativo (SMTP)</strong>
          {data.from && ` — remetente ${data.from}`}.
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
      <Mail className="size-4 shrink-0" />
      <span>
        E-mail em <strong>modo simulado</strong> (MAIL_DRIVER=log): as mensagens
        não são enviadas, apenas registradas. Configure o SMTP no .env para
        enviar de verdade.
      </span>
    </div>
  );
}

function TemplatesTab({ canWrite }: { canWrite: boolean }) {
  const { data: templates, isLoading } = useTemplates();
  const del = useDeleteTemplate();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MessageTemplateDto | null>(null);

  return (
    <div className="space-y-4">
      {canWrite && <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="size-4" /> Novo template</Button>}
      {isLoading ? (
        <div className="grid h-32 place-items-center"><CarLoader className="size-5 animate-spin text-muted-foreground" /></div>
      ) : (templates ?? []).length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhum template.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(templates ?? []).map((t) => (
            <div key={t.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{t.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge variant="secondary">{MESSAGE_EVENT_LABELS[t.event]}</Badge>
                    <Badge variant="outline">{MESSAGE_CHANNEL_LABELS[t.channel]}</Badge>
                    {t.autoSend && <Badge variant="success">auto</Badge>}
                    {!t.active && <Badge variant="destructive">inativo</Badge>}
                  </div>
                </div>
                {canWrite && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => { setEditing(t); setOpen(true); }}><Pencil className="size-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={async () => {
                      const ok = await confirm({ title: 'Excluir template', description: `Excluir o template "${t.name}"?`, destructive: true, confirmLabel: 'Excluir' });
                      if (!ok) return;
                      try { await del.mutateAsync(t.id); toast.success('Excluído'); } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Erro'); }
                    }}><Trash2 className="size-4" /></Button>
                  </div>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{t.body}</p>
            </div>
          ))}
        </div>
      )}
      <TemplateFormDialog open={open} onOpenChange={setOpen} template={editing} />
    </div>
  );
}

function HistoricoTab({ canWrite }: { canWrite: boolean }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useMessageLogs(page);
  const [sendOpen, setSendOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const logs = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setSendOpen(true)}><Send className="size-4" /> Enviar mensagem</Button>
          <Button variant="outline" onClick={() => setTestOpen(true)}><Mail className="size-4" /> Testar e-mail</Button>
        </div>
      )}
      <div className="rounded-xl border divide-y">
        {isLoading ? (
          <div className="grid h-24 place-items-center"><CarLoader className="size-5 animate-spin text-muted-foreground" /></div>
        ) : logs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma mensagem enviada.</p>
        ) : (
          logs.map((l) => (
            <div key={l.id} className="p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{MESSAGE_CHANNEL_LABELS[l.channel]}</Badge>
                <Badge variant={l.status === 'FALHA' ? 'destructive' : l.status === 'ENVIADO' ? 'success' : 'secondary'}>
                  {MESSAGE_STATUS_LABELS[l.status]}
                </Badge>
                <span className="text-muted-foreground">{MESSAGE_EVENT_LABELS[l.event]}</span>
                <span className="text-muted-foreground">→ {l.to || l.customerName || '—'}</span>
                <span className="ml-auto text-xs text-muted-foreground">{formatDate(l.createdAt)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{l.body}</p>
            </div>
          ))
        )}
      </div>
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{meta.total} envio(s)</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
          </div>
        </div>
      )}
      <ManualSendDialog open={sendOpen} onOpenChange={setSendOpen} />
      <TestEmailDialog open={testOpen} onOpenChange={setTestOpen} />
    </div>
  );
}

function TestEmailDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const test = useSendTestEmail();
  const [to, setTo] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) {
      toast.error('Informe um e-mail válido');
      return;
    }
    try {
      const res = await test.mutateAsync(to.trim());
      if (res.mode === 'log') {
        toast.success('Modo simulado (MAIL_DRIVER=log): e-mail registrado no terminal, nada foi enviado.');
      } else if (res.status === 'ENVIADO') {
        toast.success(`E-mail enviado para ${to.trim()} via SMTP.`);
      } else {
        toast.error(`Falha no envio SMTP: ${res.error ?? 'erro desconhecido'}`);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, {}, 'Erro ao enviar e-mail de teste'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Testar envio de e-mail</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="test-to">Enviar para</Label>
            <Input
              id="test-to"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="seu-email@exemplo.com"
            />
            <p className="text-xs text-muted-foreground">
              Valida a configuração SMTP. Com MAIL_DRIVER=log, o envio é apenas
              simulado (aparece no terminal e no histórico).
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={test.isPending}>
              {test.isPending ? <CarLoader className="size-4 animate-spin" /> : <Mail className="size-4" />}
              Enviar teste
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManualSendDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const send = useSendMessage();
  const [channel, setChannel] = useState('WHATSAPP');
  const [to, setTo] = useState('');
  const [body, setBody] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = sendMessageSchema.safeParse({ channel, to, body });
    if (!parsed.success) { toast.error(Object.values(zodFieldErrors(parsed.error, SEND_FIELD_LABELS))[0] ?? 'Verifique os campos do formulário'); return; }
    try {
      await send.mutateAsync(parsed.data);
      toast.success('Mensagem registrada (simulada)');
      setTo(''); setBody('');
      onOpenChange(false);
    } catch (err) { toast.error(apiErrorMessage(err, SEND_FIELD_LABELS, 'Erro ao enviar')); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Enviar mensagem manual</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>Canal</Label>
              <Select value={channel} onChange={(e) => setChannel(e.target.value)} className="w-full">
                {MESSAGE_CHANNELS.map((c) => <option key={c} value={c}>{MESSAGE_CHANNEL_LABELS[c]}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Destinatário</Label>
              <Input
                value={to}
                onChange={(e) => setTo(channel === 'EMAIL' ? e.target.value : maskPhoneOrEmail(e.target.value))}
                inputMode={channel === 'EMAIL' ? 'email' : 'tel'}
                maxLength={channel === 'EMAIL' ? undefined : 15}
                placeholder={channel === 'EMAIL' ? 'email@exemplo.com' : '(00) 00000-0000'}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label required>Mensagem</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={send.isPending}>
              {send.isPending && <CarLoader className="size-4 animate-spin" />} Enviar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
