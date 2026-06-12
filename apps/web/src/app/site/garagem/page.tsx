'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Car, LogOut, Wrench, Clock, FileText } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import {
  SERVICE_ORDER_STATUS_LABELS,
  type GarageOrderDto,
} from '@oficina/shared';
import {
  fetchGarageData,
  setGarageToken,
  getGarageToken,
  GARAGE_NO_SESSION,
} from '@/features/garage/garage-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function GaragemPage() {
  const router = useRouter();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['garage-data'],
    queryFn: fetchGarageData,
    retry: false,
  });

  useEffect(() => {
    if (
      (isError && (error as Error)?.message === GARAGE_NO_SESSION) ||
      (typeof window !== 'undefined' && !getGarageToken())
    ) {
      router.replace('/site/consulta');
    }
  }, [isError, error, router]);

  function logout() {
    setGarageToken(null);
    router.replace('/site/consulta');
  }

  if (isLoading) {
    return (
      <div className="grid h-64 place-items-center">
        <CarLoader className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="container max-w-md py-12 text-center">
        <p className="text-muted-foreground">
          {(error as Error)?.message === GARAGE_NO_SESSION
            ? 'Sua sessão expirou. Consulte novamente.'
            : 'Não foi possível carregar o histórico.'}
        </p>
        <Button className="mt-4" onClick={() => router.replace('/site/consulta')}>
          Voltar à consulta
        </Button>
      </div>
    );
  }

  return (
    <div className="container space-y-6 py-10">
      {/* Cabeçalho do veículo */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Car className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{data.vehicle.label}</h1>
            <p className="text-sm text-muted-foreground">
              Placa {data.vehicle.plate}
              {data.vehicle.currentKm != null &&
                ` · ${data.vehicle.currentKm.toLocaleString('pt-BR')} km`}
              {` · ${data.customerName}`}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={logout}>
          <LogOut className="size-4" /> Sair
        </Button>
      </div>

      {/* OS atual */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Ordem de serviço atual
        </h2>
        {data.current ? (
          <OrderCard order={data.current} highlight />
        ) : (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma ordem de serviço em andamento no momento.
            </CardContent>
          </Card>
        )}
      </section>

      {/* OS anteriores */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Histórico ({data.past.length})
        </h2>
        {data.past.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem serviços anteriores.</p>
        ) : (
          <div className="space-y-4">
            {data.past.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
          </div>
        )}
      </section>

      <p className="pt-2 text-center text-xs text-muted-foreground">
        {data.shopName}
      </p>
    </div>
  );
}

function OrderCard({
  order,
  highlight,
}: {
  order: GarageOrderDto;
  highlight?: boolean;
}) {
  const services = order.items.filter((i) => i.kind === 'SERVICE');
  const parts = order.items.filter((i) => i.kind === 'PART');

  return (
    <Card className={highlight ? 'border-primary/40 shadow-sm' : undefined}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4" /> OS #{order.number}
        </CardTitle>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
          {SERVICE_ORDER_STATUS_LABELS[order.status]}
        </span>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-xs text-muted-foreground">
          Aberta em {formatDate(order.openedAt)}
          {order.closedAt && ` · finalizada em ${formatDate(order.closedAt)}`}
        </p>

        <div>
          <p className="font-medium text-muted-foreground">Problema relatado</p>
          <p>{order.reportedProblem}</p>
        </div>

        {services.length > 0 && (
          <div>
            <p className="mb-1 flex items-center gap-1.5 font-medium text-muted-foreground">
              <Wrench className="size-3.5" /> Serviços
            </p>
            <ul className="space-y-1">
              {services.map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <span>
                    {s.description}
                    {s.quantity > 1 && (
                      <span className="text-muted-foreground"> ×{s.quantity}</span>
                    )}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatCurrency(s.total)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {parts.length > 0 && (
          <div>
            <p className="mb-1 font-medium text-muted-foreground">Peças</p>
            <ul className="space-y-1">
              {parts.map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <span>
                    {p.description}
                    {p.quantity > 1 && (
                      <span className="text-muted-foreground"> ×{p.quantity}</span>
                    )}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatCurrency(p.total)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-between border-t pt-2 font-medium">
          <span>Total</span>
          <span>{formatCurrency(order.total)}</span>
        </div>

        {/* Linha do tempo */}
        <div>
          <p className="mb-2 flex items-center gap-1.5 font-medium text-muted-foreground">
            <Clock className="size-3.5" /> Linha do tempo
          </p>
          <ol className="relative space-y-3 border-l pl-4">
            {order.timeline.map((t, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[1.36rem] top-1 size-2.5 rounded-full bg-primary" />
                <p className="font-medium">
                  {SERVICE_ORDER_STATUS_LABELS[t.status]}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(t.createdAt).toLocaleString('pt-BR')}
                  {t.note ? ` · ${t.note}` : ''}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
