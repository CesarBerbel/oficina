'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bell, CheckCheck } from 'lucide-react';
import { useNotifications, useUnreadCount, useMarkRead, useMarkAllRead } from './use-notifications';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export function NotificationBell() {
  const router = useRouter();
  const { data: unread } = useUnreadCount();
  const { data } = useNotifications({ page: 1, pageSize: 8 });
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();

  const count = unread?.count ?? 0;
  const items = data?.data ?? [];

  function open(id: string, link: string | null) {
    markRead.mutate(id);
    if (link) router.push(link);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell className="size-5" />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notificações</span>
          {count > 0 && (
            <button
              onClick={() => markAll.mutate()}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="size-3.5" /> Marcar todas
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Sem notificações.
            </p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => open(n.id, n.link)}
                className={cn(
                  'flex w-full flex-col items-start gap-0.5 border-b px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent',
                  !n.read && 'bg-primary/5',
                )}
              >
                <span className="flex w-full items-center gap-2 font-medium">
                  {!n.read && <span className="size-2 shrink-0 rounded-full bg-primary" />}
                  {n.title}
                </span>
                {n.body && <span className="text-xs text-muted-foreground">{n.body}</span>}
                <span className="text-[10px] text-muted-foreground">
                  {new Date(n.createdAt).toLocaleString('pt-BR')}
                </span>
              </button>
            ))
          )}
        </div>
        <Link
          href="/notificacoes"
          className="block border-t px-3 py-2 text-center text-xs font-medium text-primary hover:underline"
        >
          Ver todas
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
