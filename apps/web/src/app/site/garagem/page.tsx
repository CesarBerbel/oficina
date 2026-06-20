'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Car,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  LogOut,
  MailCheck,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { CarLoader } from '@/components/car-loader';
import {
  QUOTE_STATUS_LABELS,
  SERVICE_ORDER_STATUS_LABELS,
  cpfCnpjSchema,
  type GarageOrderDto,
  type QuoteItemDto,
} from '@oficina/shared';
import {
  decideGarageQuote,
  fetchGarageData,
  setGarageToken,
  getGarageToken,
  GARAGE_NO_SESSION,
} from '@/features/garage/garage-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency, formatDate } from '@/lib/utils';
import { maskCpfCnpj } from '@/lib/masks';

type GarageOrderWithQuote = GarageOrderDto & {
  quote: NonNullable<GarageOrderDto['quote']>;
};

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

  const pendingQuotes = [data.current, ...data.past].filter(
    (order): order is GarageOrderDto => !!order?.quote && order.quote.status === 'ENVIADO',
  );

  return (
    <div className="container space-y-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Car className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Portal do Cliente</h1>
            <p className="text-sm text-muted-foreground">
              {data.vehicle.label} · Placa {data.vehicle.plate}
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

      {pendingQuotes.length > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold">Você tem orçamento aguardando aprovação</p>
              <p className="text-sm text-muted-foreground">
                Revise os itens, aprove total/parcialmente ou recuse diretamente neste portal.
              </p>
            </div>
            <a href={`#os-${pendingQuotes[0].id}`}>
              <Button size="sm">Ver orçamento</Button>
            </a>
          </CardContent>
        </Card>
      )}

      <section className="grid gap-3 md:grid-cols-3">
        <InfoCard title="OS atual" value={data.current ? `#${data.current.number}` : 'Nenhuma'} />
        <InfoCard title="Histórico" value={`${data.past.length} OS anteriores`} />
        <InfoCard title="Orçamentos pendentes" value={String(pendingQuotes.length)} />
      </section>

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

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Histórico ({data.past.length})
        </h2>
        {data.past.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem serviços anteriores.</p>
        ) : (
          <div className="space-y-4">
            {data.past.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </section>

      <p className="pt-2 text-center text-xs text-muted-foreground">{data.shopName}</p>
    </div>
  );
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
        <p className="mt-1 text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function OrderCard({ order, highlight }: { order: GarageOrderDto; highlight?: boolean }) {
  const services = order.items.filter((item) => item.kind === 'SERVICE');
  const parts = order.items.filter((item) => item.kind === 'PART');

  return (
    <Card id={`os-${order.id}`} className={highlight ? 'border-primary/40 shadow-sm' : undefined}>
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

        {order.diagnosis && (
          <div>
            <p className="font-medium text-muted-foreground">Diagnóstico</p>
            <p>{order.diagnosis}</p>
          </div>
        )}

        <OrderItems title="Serviços" icon={<Wrench className="size-3.5" />} items={services} />
        <OrderItems title="Peças" items={parts} />

        <div className="flex justify-between border-t pt-2 font-medium">
          <span>Total da OS</span>
          <span>{formatCurrency(order.total)}</span>
        </div>

        {order.quote && <QuoteSection order={order as GarageOrderWithQuote} />}

        <TimelineSection order={order} />
      </CardContent>
    </Card>
  );
}

function OrderItems({
  title,
  icon,
  items,
}: {
  title: string;
  icon?: ReactNode;
  items: GarageOrderDto['items'];
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 font-medium text-muted-foreground">
        {icon} {title}
      </p>
      <ul className="space-y-1">
        {items.map((item, index) => (
          <li
            key={`${item.description}-${index}`}
            className="flex items-center justify-between gap-3"
          >
            <span>
              {item.description}
              {item.quantity > 1 && (
                <span className="text-muted-foreground"> ×{item.quantity}</span>
              )}
            </span>
            <span className="tabular-nums text-muted-foreground">{formatCurrency(item.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuoteSection({ order }: { order: GarageOrderWithQuote }) {
  const queryClient = useQueryClient();
  const quote = order.quote;
  const [decisions, setDecisions] = useState<Record<string, boolean>>({});
  const [signature, setSignature] = useState('');
  const [signerDoc, setSignerDoc] = useState('');

  const decisionMutation = useMutation({
    mutationFn: (reject: boolean) =>
      decideGarageQuote(order.id, {
        reject,
        signatureName: signature,
        signatureDoc: signerDoc,
        itemDecisions: quote.items.map((item) => ({
          itemId: item.id,
          decision: reject || !isApproved(item) ? 'RECUSADO' : 'APROVADO',
        })),
      }),
    onSuccess: async () => {
      toast.success('Resposta do orçamento registrada.');
      await queryClient.invalidateQueries({ queryKey: ['garage-data'] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao responder orçamento.');
    },
  });

  const groupedQuoteItems = useMemo(
    () => quote.items.map((item) => ({ item, linked: !!item.parentItemId })),
    [quote.items],
  );

  const docResult = cpfCnpjSchema.safeParse(signerDoc);
  const canSubmit = signature.trim().length > 0 && docResult.success && docResult.data !== null;
  const canDecide = quote.status === 'ENVIADO';
  const approvedItems = quote.items.filter((item) => isApproved(item));
  const shownServices = canDecide
    ? approvedItems
        .filter((item) => item.kind === 'SERVICE')
        .reduce((sum, item) => sum + item.total, 0)
    : quote.totalServices;
  const shownParts = canDecide
    ? approvedItems
        .filter((item) => item.kind === 'PART')
        .reduce((sum, item) => sum + item.total, 0)
    : quote.totalParts;
  const shownTotal = canDecide
    ? Math.max(0, shownServices + shownParts - quote.discount)
    : quote.total;

  function isApproved(item: QuoteItemDto): boolean {
    return decisions[item.id] ?? true;
  }

  function toggleItem(item: QuoteItemDto, checked: boolean) {
    const key = item.parentItemId ?? item.id;
    const members = quote.items.filter(
      (candidate) => (candidate.parentItemId ?? candidate.id) === key,
    );
    setDecisions((current) => {
      const next = { ...current };
      for (const member of members) next[member.id] = checked;
      return next;
    });
  }

  return (
    <div className="rounded-xl border bg-muted/30 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 font-semibold">
            <MailCheck className="size-4" /> Orçamento digital
          </p>
          <p className="text-xs text-muted-foreground">
            Status: {QUOTE_STATUS_LABELS[quote.status]}
            {quote.decidedAt &&
              ` · respondido em ${new Date(quote.decidedAt).toLocaleString('pt-BR')}`}
          </p>
        </div>
        <a href={`/acompanhar/${quote.token}`} target="_blank" rel="noreferrer">
          <Button variant="outline" size="sm">
            <ExternalLink className="size-4" /> Abrir link direto
          </Button>
        </a>
      </div>

      {quote.publicNotes && (
        <p className="mb-3 whitespace-pre-wrap rounded-lg bg-background p-3 text-xs text-muted-foreground">
          {quote.publicNotes}
        </p>
      )}

      <div className="divide-y rounded-lg border bg-background">
        {groupedQuoteItems.map(({ item, linked }) => (
          <div
            key={item.id}
            className={`flex items-center justify-between gap-3 p-3 ${linked ? 'pl-8' : ''}`}
          >
            <div className="flex items-center gap-2">
              {canDecide && (
                <input
                  type="checkbox"
                  className="size-4"
                  checked={isApproved(item)}
                  onChange={(event) => toggleItem(item, event.target.checked)}
                />
              )}
              <span>
                {linked && <span className="mr-1 text-muted-foreground">↳</span>}
                {item.description}
                <span className="text-muted-foreground"> ×{item.quantity}</span>
                {item.discountPercent > 0 && (
                  <span className="ml-1 text-xs text-emerald-700">
                    -{item.discountPercent.toLocaleString('pt-BR')}%
                  </span>
                )}
              </span>
            </div>
            <div className="text-right">
              {item.discountPercent > 0 && (
                <p className="text-xs text-muted-foreground line-through">
                  {formatCurrency(item.quantity * item.unitPrice)}
                </p>
              )}
              <p className="font-medium">{formatCurrency(item.total)}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-1 text-sm">
        <Row label="Serviços" value={formatCurrency(shownServices)} />
        <Row label="Peças" value={formatCurrency(shownParts)} />
        {quote.discount > 0 && (
          <Row label="Desconto geral" value={`- ${formatCurrency(quote.discount)}`} />
        )}
        <div className="flex justify-between pt-1 text-base font-semibold">
          <span>Total</span>
          <span>{formatCurrency(shownTotal)}</span>
        </div>
      </div>

      {canDecide ? (
        <div className="mt-4 space-y-3 rounded-lg border bg-background p-3">
          <p className="text-sm font-medium">Aprovação digital</p>
          <p className="text-xs text-muted-foreground">
            Desmarque itens que não deseja aprovar. A confirmação registra data, assinatura e origem
            da resposta.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Seu nome completo</Label>
              <Input
                value={signature}
                onChange={(event) => setSignature(event.target.value)}
                placeholder="Nome completo"
              />
            </div>
            <div className="space-y-1.5">
              <Label>CPF ou CNPJ</Label>
              <Input
                value={signerDoc}
                onChange={(event) => setSignerDoc(maskCpfCnpj(event.target.value))}
                placeholder="000.000.000-00"
                inputMode="numeric"
              />
              {signerDoc.length > 0 && !canSubmit && (
                <p className="text-xs text-destructive">Informe um CPF ou CNPJ válido.</p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={() => decisionMutation.mutate(false)}
              disabled={decisionMutation.isPending || !canSubmit}
              className="flex-1"
            >
              {decisionMutation.isPending ? (
                <CarLoader className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              Aprovar selecionados
            </Button>
            <Button
              variant="outline"
              onClick={() => decisionMutation.mutate(true)}
              disabled={decisionMutation.isPending || !canSubmit}
            >
              Recusar orçamento
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border bg-emerald-500/10 p-3 text-sm">
          Orçamento já respondido
          {quote.signatureName && ` por ${quote.signatureName}`}
          {quote.decidedAt && ` em ${new Date(quote.decidedAt).toLocaleString('pt-BR')}`}.
        </div>
      )}
    </div>
  );
}

function TimelineSection({ order }: { order: GarageOrderDto }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 font-medium text-muted-foreground">
        <Clock className="size-3.5" /> Linha do tempo
      </p>
      {order.timeline.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem atualizações públicas.</p>
      ) : (
        <ol className="relative space-y-3 border-l pl-4">
          {order.timeline.map((event, index) => (
            <li key={`${event.createdAt}-${index}`} className="relative">
              <span className="absolute -left-[1.36rem] top-1 size-2.5 rounded-full bg-primary" />
              <p className="font-medium">
                {event.status ? SERVICE_ORDER_STATUS_LABELS[event.status] : event.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(event.createdAt).toLocaleString('pt-BR')}
                {event.note ? ` · ${event.note}` : ''}
              </p>
              {event.photos.length > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {event.photos.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="overflow-hidden rounded-md border bg-muted"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt="Foto da OS"
                        className="aspect-square w-full object-cover"
                      />
                    </a>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
