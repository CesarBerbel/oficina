'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  Clock,
  LayoutDashboard,
  MonitorSmartphone,
  ShieldAlert,
  Store,
  UserRound,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { usePlatformOverview, usePlatformSessions } from '@/features/platform/use-accounts';
import { CarLoader } from '@/components/car-loader';

function Stat({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  tone?: string;
  icon: typeof Store;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <p className={`mt-1 text-2xl font-bold tracking-tight ${tone ?? ''}`}>{value}</p>
    </div>
  );
}

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

export default function PlataformaPage() {
  const { user } = useAuth();
  const { data, isLoading } = usePlatformOverview();
  const { data: sessions = [], isLoading: isLoadingSessions } = usePlatformSessions();

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

  if (isLoading || !data)
    return <CarLoader className="size-6 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <LayoutDashboard className="size-6 text-primary" /> Painel da plataforma
          </h1>
          <p className="text-muted-foreground">Visão geral das oficinas e contas do SaaS.</p>
        </div>
        <Link
          href="/contas"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Gerenciar contas <ArrowRight className="size-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Contas ativas"
          value={data.accounts.active}
          tone="text-emerald-600"
          icon={Store}
        />
        <Stat label="Oficinas" value={data.oficinas} icon={Building2} />
        <Stat
          label="Pedidos pendentes"
          value={data.pendingRequests}
          tone={data.pendingRequests > 0 ? 'text-amber-600' : ''}
          icon={Clock}
        />
        <Stat
          label="Suspensas"
          value={data.accounts.suspended}
          tone={data.accounts.suspended > 0 ? 'text-destructive' : ''}
          icon={Store}
        />
        <Stat label="Total de contas" value={data.accounts.total} icon={Store} />
        <Stat label="Sessões ativas" value={sessions.length} icon={MonitorSmartphone} />
      </div>

      {data.pendingRequests > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm text-amber-700">
            Há {data.pendingRequests} pedido(s) de oficina aguardando aprovação.
          </p>
          <Link
            href="/contas"
            className="inline-flex items-center gap-1 text-sm font-semibold text-amber-700 hover:underline"
          >
            Revisar <ArrowRight className="size-4" />
          </Link>
        </div>
      )}

      <section className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <MonitorSmartphone className="size-5 text-primary" /> Sessões ativas
            </h2>
            <p className="text-sm text-muted-foreground">
              Refresh tokens válidos, não revogados e ainda não expirados em todas as oficinas.
            </p>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            {isLoadingSessions ? 'Carregando...' : `${sessions.length} ativa(s)`}
          </span>
        </div>

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
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
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
                </tr>
              ))}
              {!isLoadingSessions && sessions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhuma sessão ativa encontrada.
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
