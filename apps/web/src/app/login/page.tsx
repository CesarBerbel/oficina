'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Wrench } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import { loginSchema } from '@oficina/shared';
import { useAuth } from '@/lib/auth-context';
import { useInstallStatus } from '@/features/auth/use-install-status';
import { apiErrorMessage, zodFieldErrors } from '@/lib/form-errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const DEFAULT_TENANT_SLUG = process.env.NEXT_PUBLIC_DEFAULT_TENANT_SLUG ?? 'oficina-modelo';

const FIELD_LABELS = {
  tenantSlug: 'Oficina',
  email: 'E-mail',
  password: 'Senha',
};

export default function LoginPage() {
  const router = useRouter();
  const { login, status } = useAuth();
  const { data: installStatus } = useInstallStatus();
  const [tenantSlug, setTenantSlug] = useState(DEFAULT_TENANT_SLUG);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/dashboard');
  }, [status, router]);

  // Sistema ainda não instalado: leva para a instalação da matriz.
  useEffect(() => {
    if (installStatus && !installStatus.installed) router.replace('/instalar');
  }, [installStatus, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = loginSchema.safeParse({ tenantSlug, email, password });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error, FIELD_LABELS));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await login(parsed.data.tenantSlug, parsed.data.email, parsed.data.password);
      toast.success('Bem-vindo de volta!');
      router.replace('/dashboard');
    } catch (err) {
      toast.error(apiErrorMessage(err, FIELD_LABELS, 'Falha ao entrar'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-muted/40 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Wrench className="size-6" />
          </span>
          <h1 className="text-xl font-semibold">Entrar na Oficina</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Informe a oficina e suas credenciais de acesso
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tenantSlug" required>
              Oficina
            </Label>
            <Input
              id="tenantSlug"
              name="tenantSlug"
              type="text"
              autoComplete="organization"
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
              placeholder="slug-da-oficina"
            />
            {errors.tenantSlug && <p className="text-xs text-destructive">{errors.tenantSlug}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email" required>
              E-mail
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" required>
              Senha
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Digite sua senha"
            />
            {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
          </div>

          <div className="text-right">
            <Link
              href="/esqueci-minha-senha"
              className="text-sm font-medium text-primary hover:underline"
            >
              Esqueci minha senha
            </Link>
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <CarLoader className="size-4 animate-spin" />}
            Entrar
          </Button>
        </div>
      </form>
    </main>
  );
}
