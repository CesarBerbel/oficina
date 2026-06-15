'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { forgotPasswordSchema } from '@oficina/shared';
import { CarLoader } from '@/components/car-loader';
import { api } from '@/lib/api';
import { apiErrorMessage, zodFieldErrors } from '@/lib/form-errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const DEFAULT_TENANT_SLUG =
  process.env.NEXT_PUBLIC_DEFAULT_TENANT_SLUG ?? 'oficina-modelo';

const FIELD_LABELS = {
  tenantSlug: 'Oficina',
  email: 'E-mail',
};

export default function ForgotPasswordPage() {
  const [tenantSlug, setTenantSlug] = useState(DEFAULT_TENANT_SLUG);
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = forgotPasswordSchema.safeParse({ tenantSlug, email });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error, FIELD_LABELS));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await api.post('/auth/forgot-password', parsed.data, {
        skipAuthRetry: true,
      });
      setSent(true);
      toast.success('Solicitação registrada');
    } catch (err) {
      toast.error(apiErrorMessage(err, FIELD_LABELS, 'Falha ao solicitar redefinição'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-muted/40 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-sm"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Wrench className="size-6" />
          </span>
          <h1 className="text-xl font-semibold">Recuperar senha</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Informe a oficina e seu e-mail. Se o usuário existir, enviaremos um
            link de redefinição.
          </p>
        </div>

        {sent ? (
          <div className="space-y-4 rounded-lg border bg-muted/50 p-4 text-sm">
            <p className="font-medium">Verifique seu e-mail</p>
            <p className="text-muted-foreground">
              Por segurança, a mensagem exibida é a mesma mesmo quando o e-mail
              não está cadastrado. O link expira em 1 hora.
            </p>
            <Button asChild className="w-full">
              <Link href="/login">Voltar ao login</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tenantSlug" required>
                Oficina
              </Label>
              <Input
                id="tenantSlug"
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
                placeholder="oficina-modelo"
              />
              {errors.tenantSlug && (
                <p className="text-xs text-destructive">{errors.tenantSlug}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email" required>
                E-mail
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@oficina.com"
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <CarLoader className="size-4 animate-spin" />}
              Enviar link de redefinição
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/login">Voltar ao login</Link>
            </Button>
          </div>
        )}
      </form>
    </main>
  );
}
