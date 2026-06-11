'use client';

import { useState } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { createLeadSchema } from '@oficina/shared';
import { maskPhone } from '@/lib/masks';
import { zodFieldErrors } from '@/lib/form-errors';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

const FIELD_LABELS = {
  name: 'Nome',
  phone: 'Telefone',
  email: 'E-mail',
  vehicle: 'Veículo',
  message: 'Mensagem',
};

export function LeadForm() {
  const [form, setForm] = useState({ name: '', phone: '', email: '', vehicle: '', message: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: k === 'phone' ? maskPhone(v) : v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createLeadSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error, FIELD_LABELS));
      return;
    }
    setErrors({});
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/public/lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) throw new Error();
      setDone(true);
    } catch {
      setErrors({ form: 'Não foi possível enviar. Tente novamente.' });
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border bg-card p-8 text-center">
        <CheckCircle2 className="size-8 text-emerald-600" />
        <p className="font-medium">Recebemos sua mensagem!</p>
        <p className="text-sm text-muted-foreground">Em breve entraremos em contato.</p>
      </div>
    );
  }

  const inputCls = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border bg-card p-5">
      <div>
        <input className={inputCls} placeholder="Seu nome *" value={form.name} onChange={(e) => set('name', e.target.value)} />
        {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <input className={inputCls} inputMode="tel" maxLength={15} placeholder="Telefone *" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone}</p>}
        </div>
        <div>
          <input className={inputCls} placeholder="E-mail (opcional)" value={form.email} onChange={(e) => set('email', e.target.value)} />
          {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
        </div>
      </div>
      <input className={inputCls} placeholder="Veículo (ex.: Gol 2018)" value={form.vehicle} onChange={(e) => set('vehicle', e.target.value)} />
      <div>
        <textarea className={`${inputCls} min-h-[100px]`} placeholder="Como podemos ajudar? *" value={form.message} onChange={(e) => set('message', e.target.value)} />
        {errors.message && <p className="mt-1 text-xs text-destructive">{errors.message}</p>}
      </div>
      {errors.form && <p className="text-xs text-destructive">{errors.form}</p>}
      <button type="submit" disabled={sending} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 font-medium text-primary-foreground disabled:opacity-50">
        {sending && <Loader2 className="size-4 animate-spin" />}
        Enviar pedido de orçamento
      </button>
    </form>
  );
}
