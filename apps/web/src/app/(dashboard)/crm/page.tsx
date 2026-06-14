'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  CalendarClock,
  Car,
  Copy,
  MessageCircle,
  RefreshCw,
  Star,
  Users,
} from 'lucide-react';
import type { PostSaleOpportunityDto, PostSaleOpportunityPriority } from '@oficina/shared';
import { toast } from 'sonner';
import { CarLoader } from '@/components/car-loader';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePostSaleCrm } from '@/features/crm/use-crm';
import { formatCurrency, formatDate } from '@/lib/utils';

const PRIORITY_VARIANT: Record<PostSaleOpportunityPriority, BadgeProps['variant']> = {
  alta: 'destructive',
  media: 'warning',
  baixa: 'secondary',
};

const KIND_LABEL: Record<PostSaleOpportunityDto['kind'], string> = {
  REVISAO_PREVENTIVA: 'Revisão preventiva',
  CLIENTE_INATIVO: 'Cliente inativo',
  RETORNO_POS_ENTREGA: 'Pós-entrega',
  ORCAMENTO_RECUSADO: 'Recuperar orçamento',
};

function whatsappHref(opportunity: PostSaleOpportunityDto): string | null {
  const raw = opportunity.whatsapp || opportunity.phone;
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  const normalized = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(opportunity.suggestedMessage)}`;
}

export default function CrmPage() {
  const { data, isLoading, refetch, isFetching } = usePostSaleCrm();

  if (isLoading || !data) {
    return (
      <div className="grid h-64 place-items-center">
        <CarLoader className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">CRM de pós-venda</h1>
          <p className="text-muted-foreground">
            Oportunidades automáticas de revisão, retorno, recuperação e reativação de clientes.
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={isFetching ? 'animate-spin' : ''} /> Atualizar
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi icon={Star} label="Oportunidades" value={data.summary.total} />
        <Kpi icon={AlertTriangle} label="Alta prioridade" value={data.summary.highPriority} tone="danger" />
        <Kpi icon={Car} label="Revisões" value={data.summary.preventiveReview} />
        <Kpi icon={Users} label="Inativos" value={data.summary.inactiveCustomers} tone="warning" />
        <Kpi icon={CalendarClock} label="Pós-entrega" value={data.summary.postDeliveryReturn} tone="success" />
      </div>

      {data.opportunities.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Nenhuma oportunidade de pós-venda no momento.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {data.opportunities.map((opportunity) => (
            <OpportunityCard key={opportunity.key} opportunity={opportunity} />
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: typeof Star;
  label: string;
  value: number;
  tone?: 'default' | 'danger' | 'warning' | 'success';
}) {
  const toneClass = {
    default: 'bg-primary/10 text-primary',
    danger: 'bg-destructive/10 text-destructive',
    warning: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    success: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  }[tone];

  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-bold">{value}</p>
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneClass}`}>
          <Icon className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}

function OpportunityCard({ opportunity }: { opportunity: PostSaleOpportunityDto }) {
  const href = whatsappHref(opportunity);

  async function copyMessage() {
    await navigator.clipboard.writeText(opportunity.suggestedMessage);
    toast.success('Mensagem copiada');
  }

  return (
    <Card>
      <CardHeader className="space-y-2 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={PRIORITY_VARIANT[opportunity.priority]}>{opportunity.priority}</Badge>
          <Badge variant="outline">{KIND_LABEL[opportunity.kind]}</Badge>
          {opportunity.serviceOrderNumber ? (
            <Badge variant="secondary">OS {opportunity.serviceOrderNumber}</Badge>
          ) : null}
        </div>
        <CardTitle className="text-base">{opportunity.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div>
          <p className="font-medium">{opportunity.customerName}</p>
          <p className="text-muted-foreground">{opportunity.vehicleLabel ?? 'Veículo não identificado'}</p>
          <p className="mt-1 text-muted-foreground">{opportunity.reason}</p>
        </div>

        <div className="grid gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground sm:grid-cols-3">
          <Info label="Último serviço" value={opportunity.lastServiceAt ? formatDate(opportunity.lastServiceAt) : '—'} />
          <Info label="Dias" value={opportunity.daysSinceLastService != null ? String(opportunity.daysSinceLastService) : '—'} />
          <Info label="Histórico" value={opportunity.estimatedValue != null ? formatCurrency(opportunity.estimatedValue) : '—'} />
        </div>

        <div className="rounded-lg border bg-background p-3 text-sm">
          {opportunity.suggestedMessage}
        </div>

        <div className="flex flex-wrap gap-2">
          {href ? (
            <Button asChild size="sm">
              <a href={href} target="_blank" rel="noreferrer">
                <MessageCircle /> Abrir WhatsApp
              </a>
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={copyMessage}>
            <Copy /> Copiar mensagem
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href={`/clientes/${opportunity.customerId}`}>Abrir cliente</Link>
          </Button>
          {opportunity.serviceOrderId ? (
            <Button asChild size="sm" variant="ghost">
              <Link href={`/os/${opportunity.serviceOrderId}`}>Abrir OS</Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p>{label}</p>
      <p className="font-medium text-foreground">{value}</p>
    </div>
  );
}
