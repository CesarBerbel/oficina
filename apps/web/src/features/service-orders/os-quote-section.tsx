'use client';

import { useState } from 'react';
import { FileText, Copy, CheckCircle2, XCircle, ExternalLink, Mail, RotateCcw, ShoppingCart } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import {
  QUOTE_STATUS_LABELS,
  type QuoteDto,
  type ServiceOrderStatus,
} from '@oficina/shared';
import { ApiError } from '@/lib/api';
import {
  useGenerateQuote,
  useGeneratePurchase,
  useReopenQuote,
  useSendQuoteEmail,
} from './use-service-orders';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { formatCurrency } from '@/lib/utils';

const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  RASCUNHO: 'secondary',
  ENVIADO: 'warning',
  APROVADO: 'success',
  APROVADO_PARCIAL: 'success',
  RECUSADO: 'destructive',
};

// Orçamento só pode ser gerado/regerado após o diagnóstico, enquanto em
// orçamento, ou após uma recusa (novo orçamento). Espelha a regra do backend.
const GENERATE_STATUSES: ServiceOrderStatus[] = [
  'DIAGNOSTICO_PRONTO',
  'ORCAMENTO',
  'ORCAMENTO_RECUSADO',
];

export function OsQuoteSection({
  osId,
  osStatus,
  quote,
  publicToken,
  editable,
  canQuote,
}: {
  osId: string;
  osStatus: ServiceOrderStatus;
  quote: QuoteDto | null;
  publicToken: string;
  editable: boolean;
  canQuote: boolean;
}) {
  const generate = useGenerateQuote(osId);
  const sendEmail = useSendQuoteEmail(osId);
  const reopen = useReopenQuote(osId);
  const generatePurchase = useGeneratePurchase(osId);
  const confirm = useConfirm();
  const [notes, setNotes] = useState(quote?.publicNotes ?? '');
  const [reason, setReason] = useState('');

  // Reenvio = já foi enviado ao menos uma vez (exige motivo).
  const isResend = (quote?.sendCount ?? 0) >= 1;
  const canGenerate = GENERATE_STATUSES.includes(osStatus);
  const isRejected = osStatus === 'ORCAMENTO_RECUSADO';
  const isWaitingPart = osStatus === 'AGUARDANDO_PECA';
  const isApproved = osStatus === 'ORCAMENTO_APROVADO';

  const trackUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/acompanhar/${publicToken}`
      : `/acompanhar/${publicToken}`;

  async function onGenerate() {
    if (isResend && !reason.trim()) {
      toast.error('Informe o motivo do reenvio do orçamento.');
      return;
    }
    try {
      await generate.mutateAsync({
        publicNotes: notes || undefined,
        reason: isResend ? reason.trim() : undefined,
      });
      toast.success(isResend ? 'Orçamento reenviado' : 'Orçamento gerado e enviado');
      setReason('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao gerar orçamento');
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(trackUrl);
    toast.success('Link copiado');
  }

  async function onSendEmail() {
    try {
      const { to } = await sendEmail.mutateAsync();
      toast.success(`Orçamento enviado para ${to}`);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Erro ao enviar o orçamento',
      );
    }
  }

  async function onGeneratePurchase() {
    try {
      const { created } = await generatePurchase.mutateAsync();
      toast.success(`${created} pedido(s) de compra gerado(s)`);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Erro ao gerar pedido de compra',
      );
    }
  }

  async function onReopen() {
    const ok = await confirm({
      title: 'Reabrir orçamento',
      description:
        'A OS volta a ser editável para adicionar serviços, combos e peças e gerar um novo orçamento.',
      confirmLabel: 'Reabrir',
    });
    if (!ok) return;
    try {
      await reopen.mutateAsync();
      toast.success('Orçamento reaberto. Edite a OS e gere um novo orçamento.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao reabrir o orçamento');
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4" /> Orçamento
        </CardTitle>
        {quote && (
          <Badge variant={STATUS_VARIANT[quote.status]}>
            {QUOTE_STATUS_LABELS[quote.status]}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!quote && (
          <p className="text-muted-foreground">
            Nenhum orçamento gerado. Gere para enviar ao cliente aprovar online.
          </p>
        )}

        {canQuote && editable && osStatus === 'ENTRADA' && (
          <p className="text-xs text-muted-foreground">
            Conclua o diagnóstico antes de gerar o orçamento.
          </p>
        )}

        {canQuote && editable && canGenerate && (
          <div className="space-y-2">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observações públicas (aparecem ao cliente)..."
              rows={2}
            />
            {isResend && (
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Motivo do reenvio (obrigatório)..."
                rows={2}
                className="border-amber-300 focus-visible:ring-amber-400"
              />
            )}
            <Button
              size="sm"
              onClick={onGenerate}
              disabled={generate.isPending || (isResend && !reason.trim())}
            >
              {generate.isPending ? <CarLoader className="size-4 animate-spin" /> : <FileText className="size-4" />}
              {isRejected
                ? 'Gerar novo orçamento'
                : quote
                  ? 'Reenviar orçamento'
                  : 'Gerar orçamento'}
            </Button>
          </div>
        )}

        {quote && (
          <>
            {/* Orçamento aprovado: OS travada (somente leitura). Esconde link e
                envio; oferece reabrir o orçamento para editar e refazer. */}
            {!isApproved && (
              <>
                <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2">
                  <input
                    readOnly
                    value={trackUrl}
                    className="flex-1 truncate bg-transparent text-xs text-muted-foreground outline-none"
                  />
                  <Button size="icon" variant="ghost" onClick={copyLink} aria-label="Copiar link">
                    <Copy className="size-4" />
                  </Button>
                  <a href={trackUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                    <ExternalLink className="size-4" />
                  </a>
                </div>

                {canQuote && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={onSendEmail}
                    disabled={sendEmail.isPending}
                  >
                    {sendEmail.isPending ? (
                      <CarLoader className="size-4 animate-spin" />
                    ) : (
                      <Mail className="size-4" />
                    )}
                    Enviar por e-mail
                  </Button>
                )}

                {isWaitingPart && canQuote && (
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={onGeneratePurchase}
                    disabled={generatePurchase.isPending}
                  >
                    {generatePurchase.isPending ? (
                      <CarLoader className="size-4 animate-spin" />
                    ) : (
                      <ShoppingCart className="size-4" />
                    )}
                    Gerar pedido de compra
                  </Button>
                )}
              </>
            )}

            {isApproved && canQuote && (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={onReopen}
                disabled={reopen.isPending}
              >
                {reopen.isPending ? (
                  <CarLoader className="size-4 animate-spin" />
                ) : (
                  <RotateCcw className="size-4" />
                )}
                Reabrir orçamento
              </Button>
            )}

            {quote.decidedAt && (
              <div className="rounded-md border p-2 text-xs">
                <p className="font-medium">
                  Decisão do cliente: {QUOTE_STATUS_LABELS[quote.status]}
                </p>
                <p className="text-muted-foreground">
                  {new Date(quote.decidedAt).toLocaleString('pt-BR')}
                  {quote.signatureName && ` · assinado por ${quote.signatureName}`}
                  {quote.decisionIp && ` · IP ${quote.decisionIp}`}
                </p>
                <div className="mt-2 space-y-1">
                  {quote.items.map((it) => (
                    <div key={it.id} className="flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        {it.decision === 'APROVADO' ? (
                          <CheckCircle2 className="size-3.5 text-emerald-600" />
                        ) : it.decision === 'RECUSADO' ? (
                          <XCircle className="size-3.5 text-destructive" />
                        ) : null}
                        {it.description}
                      </span>
                      <span className="text-muted-foreground">{formatCurrency(it.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between border-t pt-2 font-medium">
              <span>Total do orçamento</span>
              <span>{formatCurrency(quote.total)}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
