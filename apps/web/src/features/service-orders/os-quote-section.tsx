'use client';

import { useState } from 'react';
import { Loader2, FileText, Copy, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import {
  QUOTE_STATUS_LABELS,
  type QuoteDto,
} from '@oficina/shared';
import { ApiError } from '@/lib/api';
import { useGenerateQuote } from './use-service-orders';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';

const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  RASCUNHO: 'secondary',
  ENVIADO: 'warning',
  APROVADO: 'success',
  APROVADO_PARCIAL: 'success',
  RECUSADO: 'destructive',
};

export function OsQuoteSection({
  osId,
  quote,
  publicToken,
  editable,
  canQuote,
}: {
  osId: string;
  quote: QuoteDto | null;
  publicToken: string;
  editable: boolean;
  canQuote: boolean;
}) {
  const generate = useGenerateQuote(osId);
  const [notes, setNotes] = useState(quote?.publicNotes ?? '');

  const trackUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/acompanhar/${publicToken}`
      : `/acompanhar/${publicToken}`;

  async function onGenerate() {
    try {
      await generate.mutateAsync(notes || undefined);
      toast.success('Orçamento gerado e enviado');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao gerar orçamento');
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(trackUrl);
    toast.success('Link copiado');
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

        {canQuote && editable && (
          <div className="space-y-2">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observações públicas (aparecem ao cliente)..."
              rows={2}
            />
            <Button size="sm" onClick={onGenerate} disabled={generate.isPending}>
              {generate.isPending ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
              {quote ? 'Regerar orçamento' : 'Gerar orçamento'}
            </Button>
          </div>
        )}

        {quote && (
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
