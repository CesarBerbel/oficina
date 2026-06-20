'use client';

import { useMemo, useState } from 'react';
import { MonitorSmartphone, ShieldAlert, UserRound, LogOut, RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import {
  usePlatformSessions,
  useRevokePlatformSession,
  useLogoutPlatformUserSessions,
} from '@/features/platform/use-accounts';
import { CarLoader } from '@/components/car-loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function compactUserAgent(value: string | null): string {
  if (!value) return 'Não informado';
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 90 ? `${normalized.slice(0, 87)}...` : normalized;
}

export default function SessoesPage() {
  const { user } = useAuth();
  const { data: sessions = [], isLoading, isFetching, refetch } = usePlatformSessions();
  const revokeSession = useRevokePlatformSession();
  const logoutUser = useLogoutPlatformUserSessions();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) =>
      [s.userName, s.userEmail, s.accountName, s.tenantName, s.tenantSlug, s.ip ?? '']
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [sessions, query]);

  if (!user?.platformAdmin) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <ShieldAlert className="mx-auto mb-3 size-8 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Acesso restrito</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Esta área é exclusiva do administrador da plataforma.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <MonitorSmartphone className="size-6 text-primary" /> Sessões ativas
          </h1>
          <p className="text-muted-foreground">
            Sessões (refresh tokens válidos) de todas as oficinas. Revogue uma sessão ou encerre
            todas as de um usuário.
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
          <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrar por usuário, e-mail, oficina ou IP…"
          className="max-w-sm"
        />
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          {isLoading ? 'Carregando…' : `${filtered.length} de ${sessions.length} sessão(ões)`}
        </span>
      </div>

      <section className="rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Usuário</th>
                <th className="px-4 py-3 font-medium">Conta / oficina</th>
                <th className="px-4 py-3 font-medium">IP</th>
                <th className="px-4 py-3 font-medium">Dispositivo</th>
                <th className="px-4 py-3 font-medium">Criada/rotacionada</th>
                <th className="px-4 py-3 font-medium">Expira</th>
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((session) => (
                <tr key={session.id} className="border-t">
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-start gap-2">
                      <UserRound className="mt-0.5 size-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{session.userName}</p>
                        <p className="text-xs text-muted-foreground">{session.userEmail}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {session.role}
                          {session.platformAdmin ? ' · Super admin' : ''}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <p className="font-medium">{session.accountName}</p>
                    <p className="text-xs text-muted-foreground">
                      {session.tenantName} · {session.tenantSlug}
                    </p>
                  </td>
                  <td className="px-4 py-3 align-top text-muted-foreground">
                    {session.ip ?? 'Não informado'}
                  </td>
                  <td className="max-w-[280px] px-4 py-3 align-top text-muted-foreground">
                    {compactUserAgent(session.userAgent)}
                  </td>
                  <td className="px-4 py-3 align-top text-muted-foreground">
                    {formatDateTime(session.createdAt)}
                  </td>
                  <td className="px-4 py-3 align-top text-muted-foreground">
                    {formatDateTime(session.expiresAt)}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={revokeSession.isPending}
                        onClick={() => revokeSession.mutate(session.id)}
                      >
                        Revogar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={logoutUser.isPending}
                        onClick={() => logoutUser.mutate(session.userId)}
                        title="Encerrar todas as sessões deste usuário"
                      >
                        <LogOut className="size-4" /> Todas
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    {sessions.length === 0
                      ? 'Nenhuma sessão ativa encontrada.'
                      : 'Nenhuma sessão corresponde ao filtro.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
