'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { changePasswordSchema } from '@oficina/shared';
import { CarLoader } from '@/components/car-loader';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { apiErrorMessage, zodFieldErrors } from '@/lib/form-errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const FIELD_LABELS = {
  currentPassword: 'Senha atual',
  password: 'Nova senha',
  confirmPassword: 'Confirmação',
};

export default function ChangePasswordPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const forced = user?.forcePasswordChange === true;
  const [mandatoryParam, setMandatoryParam] = useState(false);

  useEffect(() => {
    setMandatoryParam(
      new URLSearchParams(window.location.search).get('obrigatoria') === '1',
    );
  }, []);

  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = changePasswordSchema.safeParse({
      currentPassword: forced ? undefined : currentPassword,
      password,
      confirmPassword,
    });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error, FIELD_LABELS));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      try {
        await api.post('/auth/change-password', parsed.data);
      } catch (err) {
        if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
          await api.post('/auth/me/change-password', parsed.data);
        } else {
          throw err;
        }
      }
      toast.success('Senha alterada. Entre novamente com a nova senha.');
      await logout();
      router.replace('/login');
    } catch (err) {
      toast.error(apiErrorMessage(err, FIELD_LABELS, 'Falha ao alterar senha'));
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
            <KeyRound className="size-6" />
          </span>
          <h1 className="text-xl font-semibold">Trocar senha</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {forced || mandatoryParam
              ? 'Para continuar, cadastre uma senha definitiva para seu usuário.'
              : 'Atualize sua senha de acesso ao sistema.'}
          </p>
        </div>

        {(forced || mandatoryParam) && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Sua senha precisa ser alterada antes de acessar o sistema.
          </div>
        )}

        <div className="space-y-4">
          {!forced && (
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword" required>
                Senha atual
              </Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              {errors.currentPassword && (
                <p className="text-xs text-destructive">{errors.currentPassword}</p>
              )}
            </div>
          )}

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
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword" required>
              Confirmar nova senha
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {errors.confirmPassword && (
              <p className="text-xs text-destructive">{errors.confirmPassword}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <CarLoader className="size-4 animate-spin" />}
            Salvar nova senha
          </Button>
        </div>
      </form>
    </main>
  );
}
