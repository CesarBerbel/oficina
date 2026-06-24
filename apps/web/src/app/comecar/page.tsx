'use client';

import { useEffect, useState } from 'react';
import { Wrench, ShieldCheck, Globe, Rocket, Check } from 'lucide-react';
import { toast } from 'sonner';
import { createAccountRequestSchema } from '@oficina/shared';
import { api } from '@/lib/api';
import { apiErrorMessage, zodFieldErrors } from '@/lib/form-errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const FIELD_LABELS = {
  name: 'Nome da oficina',
  slug: 'Endereço (subdomínio)',
  contactName: 'Seu nome',
  email: 'E-mail',
  phone: 'Telefone',
  message: 'Mensagem',
};

const BENEFITS = [
  { icon: Globe, title: 'Site próprio', text: 'Seu endereço na hora: nomedasua-oficina online.' },
  {
    icon: ShieldCheck,
    title: 'Dados isolados',
    text: 'Sua oficina, seus dados — separados de todo mundo.',
  },
  {
    icon: Rocket,
    title: 'Gestão completa',
    text: 'OS, estoque, financeiro, CRM e mais, num lugar só.',
  },
];

export default function ComecarPage() {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Pré-preenche o subdomínio quando veio de um host livre (?slug=...).
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('slug');
    if (s) setSlug(s.toLowerCase());
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createAccountRequestSchema.safeParse({
      name,
      slug,
      contactName,
      email,
      phone,
      message,
    });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error, FIELD_LABELS));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await api.post('/public/account-request', parsed.data);
      setDone(true);
    } catch (err) {
      toast.error(apiErrorMessage(err, FIELD_LABELS, 'Falha ao enviar o pedido'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh bg-muted/40">
      <header className="border-b bg-card">
        <div className="container flex items-center justify-between py-4">
          <span className="flex items-center gap-2 font-semibold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Wrench className="size-4" />
            </span>
            Oficina
          </span>
        </div>
      </header>

      <section className="container grid gap-10 py-12 lg:grid-cols-2 lg:py-20">
        <div>
          <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Crie a sua oficina online
          </h1>
          <p className="mt-3 text-pretty text-muted-foreground">
            Tenha um site próprio e um sistema completo de gestão — OS, orçamentos, estoque,
            financeiro e CRM. Conta isolada, no seu endereço.
          </p>
          <ul className="mt-8 space-y-4">
            {BENEFITS.map((b) => (
              <li key={b.title} className="flex gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <b.icon className="size-5" />
                </span>
                <div>
                  <p className="font-semibold">{b.title}</p>
                  <p className="text-sm text-muted-foreground">{b.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-8">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                <Check className="size-6" />
              </span>
              <h2 className="text-lg font-semibold">Pedido enviado!</h2>
              <p className="text-sm text-muted-foreground">
                Recebemos seu pedido. Entraremos em contato para liberar a sua oficina.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <h2 className="text-lg font-semibold">Quero criar minha oficina</h2>

              <Field id="name" label="Nome da oficina" error={errors.name}>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Auto Center do João"
                />
              </Field>

              <Field
                id="slug"
                label="Endereço (subdomínio)"
                error={errors.slug}
                hint="Será o endereço do seu site. Use letras, números e hífens."
              >
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  placeholder="autocenterdojoao"
                />
              </Field>

              <Field id="contactName" label="Seu nome" error={errors.contactName}>
                <Input
                  id="contactName"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Como podemos te chamar"
                />
              </Field>

              <Field id="email" label="E-mail" error={errors.email}>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@email.com"
                />
              </Field>

              <Field id="phone" label="Telefone (opcional)" error={errors.phone}>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(11) 99999-0000"
                />
              </Field>

              <Field id="message" label="Mensagem (opcional)" error={errors.message}>
                <textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Conte um pouco sobre a sua oficina"
                />
              </Field>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Enviando…' : 'Enviar pedido'}
              </Button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
