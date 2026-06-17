'use client';

import Link from 'next/link';
import { Bell, CheckCheck } from 'lucide-react';
import { useMarkAllRead, useMarkRead } from '@/features/notifications/use-notifications';
import { useNotificationInbox } from '@/features/operational/use-operational';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const PRIORITY: Record<string, BadgeProps['variant']> = {
  alta: 'destructive',
  media: 'warning',
  baixa: 'secondary',
};

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export default function CentralNotificacoesPage() {
  const { data, isLoading } = useNotificationInbox();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inbox de notificações</h1>
          <p className="text-muted-foreground">
            Central unificada de Recepção, Oficina, CRM, Financeiro e Sistema.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => markAllRead.mutate()}
          disabled={markAllRead.isPending || !data?.unreadTotal}
        >
          <CheckCheck className="mr-2 size-4" /> Marcar tudo como lido
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {(data?.categories ?? []).map((category) => (
          <Card key={category.category}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{category.label}</p>
              <p className="mt-1 text-2xl font-bold">{category.unread}</p>
              <p className="text-xs text-muted-foreground">{category.total} no total</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Bell className="size-5 text-primary" />
            <h2 className="font-semibold">Notificações recentes</h2>
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando notificações...</p>
          ) : null}
          {(data?.items ?? []).length === 0 ? (
            <p className="rounded-lg border p-4 text-sm text-muted-foreground">
              Nenhuma notificação encontrada.
            </p>
          ) : (
            <div className="space-y-2">
              {data!.items.map((item) => {
                const content = (
                  <div className="rounded-lg border p-3 transition-colors hover:bg-accent">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{item.title}</p>
                          {!item.read ? <Badge>nova</Badge> : null}
                          <Badge variant={PRIORITY[item.priority] ?? 'secondary'}>
                            {item.priority}
                          </Badge>
                          <Badge variant="outline">{item.category}</Badge>
                        </div>
                        {item.body ? (
                          <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                        ) : null}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDateTime(item.createdAt)}
                        </p>
                      </div>
                      {!item.read ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(event) => {
                            event.preventDefault();
                            markRead.mutate(item.id);
                          }}
                        >
                          Marcar lida
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
                return item.link ? (
                  <Link key={item.id} href={item.link}>
                    {content}
                  </Link>
                ) : (
                  <div key={item.id}>{content}</div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
