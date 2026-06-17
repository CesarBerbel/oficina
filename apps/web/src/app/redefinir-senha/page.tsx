'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { resetPasswordSchema } from '@oficina/shared';
import { CarLoader } from '@/components/car-loader';
import { api } from '@/lib/api';
import { apiErrorMessage, zodFieldErrors } from '@/lib/form-errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const FIELD_LABELS = {
  token: 'Token',
  password: 'Nova senha',
};

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState('');

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') ?? '');
  }, []);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = resetPasswordSchema.safeParse({ token, password });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error, FIELD_LABELS));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await api.post('/auth/reset-password', parsed.data, {
        skipAuthRetry: true,
      });
      toast.success('Senha redefinida. Faça login novamente.');
      router.replace('/login');
    } catch (err) {
      toast.error(apiErrorMessage(err, FIELD_LABELS, 'Falha ao redefinir senha'));
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
          <h1 className="text-xl font-semibold">Nova senha</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre uma nova senha para recuperar o acesso ao sistema.
          </p>
        </div>

        {!token && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            Link inválido: token não informado.
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password" required>
              Nova senha
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo de 8 caracteres"
            />
            {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
            {errors.token && <p className="text-xs text-destructive">{errors.token}</p>}
          </div>

          <Button type="submit" className="w-full" disabled={submitting || !token}>
            {submitting && <CarLoader className="size-4 animate-spin" />}
            Redefinir senha
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">Voltar ao login</Link>
          </Button>
        </div>
      </form>
    </main>
  );
}
