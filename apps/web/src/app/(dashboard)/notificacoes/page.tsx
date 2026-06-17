'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bell, BellRing, CheckCheck } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import {
  useNotifications,
  useMarkRead,
  useMarkAllRead,
} from '@/features/notifications/use-notifications';
import { enablePush, isPushEnabled, pushSupported } from '@/features/notifications/push';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function NotificationsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useNotifications({ page, pageSize: 20 });
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  // Marca como lida ao chegar via push (?notif=<id>)
  useEffect(() => {
    const id = searchParams.get('notif');
    if (id) {
      markRead.mutate(id);
      router.replace('/notificacoes');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    isPushEnabled()
      .then(setPushOn)
      .catch(() => setPushOn(false));
  }, []);

  async function togglePush() {
    setPushBusy(true);
    try {
      await enablePush();
      setPushOn(true);
      toast.success('Notificações push ativadas neste dispositivo');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao ativar push');
    } finally {
      setPushBusy(false);
    }
  }

  const items = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notificações</h1>
          <p className="text-muted-foreground">Avisos do sistema.</p>
        </div>
        <div className="flex gap-2">
          {pushSupported() && !pushOn && (
            <Button variant="outline" onClick={togglePush} disabled={pushBusy}>
              {pushBusy ? (
                <CarLoader className="size-4 animate-spin" />
              ) : (
                <BellRing className="size-4" />
              )}
              Ativar push
            </Button>
          )}
          <Button variant="outline" onClick={() => markAll.mutate()}>
            <CheckCheck className="size-4" /> Marcar todas como lidas
          </Button>
        </div>
      </div>

      <div className="rounded-xl border">
        {isLoading ? (
          <div className="grid h-32 place-items-center">
            <CarLoader className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="grid h-40 place-items-center text-center text-sm text-muted-foreground">
            <div>
              <Bell className="mx-auto mb-2 size-6" />
              Nenhuma notificação.
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  if (!n.read) markRead.mutate(n.id);
                  if (n.link) router.push(n.link);
                }}
                className={cn(
                  'flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left transition-colors hover:bg-accent',
                  !n.read && 'bg-primary/5',
                )}
              >
                <span className="flex items-center gap-2 font-medium">
                  {!n.read && <span className="size-2 rounded-full bg-primary" />}
                  {n.title}
                </span>
                {n.body && <span className="text-sm text-muted-foreground">{n.body}</span>}
                <span className="text-xs text-muted-foreground">
                  {new Date(n.createdAt).toLocaleString('pt-BR')}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            página {meta.page} de {meta.totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense
      fallback={
        <div className="grid h-64 place-items-center">
          <CarLoader className="size-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <NotificationsContent />
    </Suspense>
  );
}
