'use client';

import { LogOut, MonitorSmartphone, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { CarLoader } from '@/components/car-loader';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { useRevokeUserSession, useUserSessions } from '@/features/auth/use-sessions';

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function compactUa(value: string | null): string {
  if (!value) return 'Dispositivo não informado';
  return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}

export default function SessoesPage() {
  const { logout, logoutAll } = useAuth();
  const { data = [], isLoading } = useUserSessions();
  const revoke = useRevokeUserSession();

  async function onLogoutAll() {
    await logoutAll();
    toast.success('Todas as sessões foram encerradas.');
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ShieldCheck className="size-6 text-primary" /> Segurança e sessões
          </h1>
          <p className="text-muted-foreground">
            Revise dispositivos conectados e encerre acessos que você não reconhece.
          </p>
        </div>
        <Button variant="destructive" onClick={onLogoutAll}>
          <LogOut className="size-4" /> Sair de todos os dispositivos
        </Button>
      </div>

      <section className="rounded-xl border bg-card">
        <div className="border-b p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <MonitorSmartphone className="size-5 text-primary" /> Minhas sessões ativas
          </h2>
          <p className="text-sm text-muted-foreground">
            Sessões baseadas em refresh tokens válidos, não revogados e ainda não expirados.
          </p>
        </div>
        {isLoading ? (
          <div className="grid h-32 place-items-center">
            <CarLoader className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : data.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma sessão ativa.</p>
        ) : (
          <div className="divide-y">
            {data.map((session) => (
              <div
                key={session.id}
                className="flex flex-wrap items-start justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {session.current ? 'Sessão atual' : 'Outro dispositivo'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    IP: {session.ip ?? 'não informado'} · criada/rotacionada em{' '}
                    {formatDateTime(session.createdAt)} · expira em{' '}
                    {formatDateTime(session.expiresAt)}
                  </p>
                  <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
                    {compactUa(session.userAgent)}
                  </p>
                </div>
                <Button
                  variant={session.current ? 'destructive' : 'outline'}
                  size="sm"
                  disabled={revoke.isPending}
                  onClick={async () => {
                    await revoke.mutateAsync(session.id);
                    toast.success('Sessão encerrada.');
                    if (session.current) await logout();
                  }}
                >
                  Encerrar
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
