'use client';

import { use, useState } from 'react';
import { Wrench, Loader2, Car, CheckCircle2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { cpfCnpjSchema, type QuoteItemDto } from '@oficina/shared';
import { usePublicTracking, useQuoteDecision } from '@/features/public/use-tracking';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { maskCpfCnpj } from '@/lib/masks';

export default function PublicTrackingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const { data, isLoading, isError } = usePublicTracking(token);
  const decide = useQuoteDecision(token);

  // Decisão por item (default aprovado)
  const [decisions, setDecisions] = useState<Record<string, boolean>>({});
  const [signature, setSignature] = useState('');
  const [signerDoc, setSignerDoc] = useState('');

  if (isLoading) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }
  if (isError || !data) {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold">Acompanhamento não encontrado</h1>
          <p className="mt-2 text-muted-foreground">Verifique o link recebido.</p>
        </div>
      </main>
    );
  }

  const quote = data.quote;
  const canDecide = quote && quote.status === 'ENVIADO';

  // Só permite aprovar/recusar com nome preenchido e CPF/CNPJ válido.
  const nameOk = signature.trim().length > 0;
  const docResult = cpfCnpjSchema.safeParse(signerDoc);
  const docOk = docResult.success && docResult.data !== null;
  const canSubmit = nameOk && docOk;

  function isApproved(item: QuoteItemDto): boolean {
    return decisions[item.id] ?? true;
  }

  // Serviço + peças vinculadas formam um grupo (chave = parentItemId ?? id).
  function groupKeyOf(item: QuoteItemDto): string {
    return item.parentItemId ?? item.id;
  }

  // Marcar/desmarcar um item arrasta todo o seu grupo: desmarcar uma peça
  // desmarca o serviço (e as demais peças); desmarcar o serviço desmarca as peças.
  function toggleItem(item: QuoteItemDto, checked: boolean) {
    if (!quote) return;
    const key = groupKeyOf(item);
    const members = quote.items
      .filter((q) => groupKeyOf(q) === key)
      .map((q) => q.id);
    setDecisions((d) => {
      const next = { ...d };
      for (const id of members) next[id] = checked;
      return next;
    });
  }

  async function submit(reject: boolean) {
    if (!quote || !canSubmit) return;
    const itemDecisions = quote.items.map((it) => ({
      itemId: it.id,
      decision: (isApproved(it) ? 'APROVADO' : 'RECUSADO') as 'APROVADO' | 'RECUSADO',
    }));
    try {
      await decide.mutateAsync({
        itemDecisions: reject ? [] : itemDecisions,
        reject,
        signatureName: signature.trim(),
        signatureDoc: signerDoc,
      });
      toast.success(reject ? 'Orçamento recusado' : 'Orçamento aprovado. Obrigado!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar');
    }
  }

  return (
    <main className="min-h-dvh bg-muted/30 pb-16">
      <header className="border-b bg-card">
        <div className="container flex items-center gap-2 py-4 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wrench className="size-4" />
          </span>
          {data.shopName}
        </div>
      </header>

      <div className="container max-w-3xl space-y-5 py-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Ordem de Serviço #{data.number}
            </h1>
            <p className="text-muted-foreground">{data.customerName}</p>
          </div>
        </div>

        {/* Veículo */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Car className="size-4" /> Veículo
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="font-medium">{data.vehicleLabel}</p>
            <p className="text-muted-foreground">{data.vehiclePlate}</p>
          </CardContent>
        </Card>

        {/* Relato / diagnóstico */}
        <Card>
          <CardContent className="space-y-3 p-5 text-sm">
            <div>
              <p className="font-semibold text-muted-foreground">Problema relatado</p>
              <p>{data.reportedProblem}</p>
            </div>
            {data.diagnosis && (
              <div>
                <p className="font-semibold text-muted-foreground">Diagnóstico</p>
                <p>{data.diagnosis}</p>
              </div>
            )}
            {data.publicNotes && (
              <div>
                <p className="font-semibold text-muted-foreground">Observações</p>
                <p>{data.publicNotes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Orçamento / itens */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="size-4" /> Orçamento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem itens ainda.</p>
            ) : (
              <div className="divide-y">
                {data.items.map((it, i) => {
                  const quoteItem = quote?.items[i];
                  const linked = !!quoteItem?.parentItemId;
                  return (
                    <div
                      key={i}
                      className={`flex items-center justify-between gap-3 py-2 text-sm ${linked ? 'pl-6' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        {canDecide && quoteItem && (
                          <input
                            type="checkbox"
                            className="size-4"
                            checked={isApproved(quoteItem)}
                            onChange={(e) => toggleItem(quoteItem, e.target.checked)}
                          />
                        )}
                        <span>
                          {linked && (
                            <span className="mr-1 text-muted-foreground">↳</span>
                          )}
                          {it.description}
                          <span className="text-muted-foreground"> ×{it.quantity}</span>
                        </span>
                      </div>
                      <span className="font-medium">{formatCurrency(it.total)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="space-y-1 border-t pt-2 text-sm">
              <Row label="Serviços" value={formatCurrency(data.totalServices)} />
              <Row label="Peças" value={formatCurrency(data.totalParts)} />
              {data.discount > 0 && <Row label="Desconto" value={`- ${formatCurrency(data.discount)}`} />}
              <div className="flex justify-between pt-1 text-base font-semibold">
                <span>Total</span>
                <span>{formatCurrency(data.total)}</span>
              </div>
            </div>

            {canDecide ? (
              <div className="space-y-3 rounded-lg border bg-muted/40 p-3">
                <p className="text-sm font-medium">Aprovação do orçamento</p>
                <p className="text-xs text-muted-foreground">
                  Desmarque itens que não deseja aprovar. Confirme com seu nome e
                  CPF/CNPJ (assinatura).
                </p>
                <div className="space-y-1.5">
                  <Label>Seu nome (assinatura)</Label>
                  <Input value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Nome completo" />
                </div>
                <div className="space-y-1.5">
                  <Label>CPF ou CNPJ</Label>
                  <Input
                    value={signerDoc}
                    onChange={(e) => setSignerDoc(maskCpfCnpj(e.target.value))}
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                  />
                  {signerDoc.length > 0 && !docOk && (
                    <p className="text-xs text-destructive">
                      Informe um CPF ou CNPJ válido.
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => submit(false)}
                    disabled={decide.isPending || !canSubmit}
                    className="flex-1"
                  >
                    {decide.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                    Aprovar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => submit(true)}
                    disabled={decide.isPending || !canSubmit}
                  >
                    Recusar
                  </Button>
                </div>
              </div>
            ) : quote?.decidedAt ? (
              <div className="rounded-lg border bg-emerald-500/10 p-3 text-sm">
                Orçamento já respondido em {new Date(quote.decidedAt).toLocaleString('pt-BR')}
                {quote.signatureName && ` por ${quote.signatureName}`}.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
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
