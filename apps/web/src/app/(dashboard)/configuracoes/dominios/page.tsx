'use client';

import { useState } from 'react';
import { Trash2, Plus, Star, ShieldCheck, Stethoscope, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import type { TenantDomainDnsCheckDto } from '@oficina/shared';
import { CarLoader } from '@/components/car-loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  useAddDomain,
  useDnsCheck,
  useDomains,
  useRemoveDomain,
  useVerifyDomain,
} from '@/features/domains/use-domains';

export default function DominiosPage() {
  const { data: domains, isLoading } = useDomains();
  const add = useAddDomain();
  const remove = useRemoveDomain();
  const verify = useVerifyDomain();
  const dnsCheck = useDnsCheck();
  const [domain, setDomain] = useState('');
  const [checks, setChecks] = useState<Record<string, TenantDomainDnsCheckDto>>({});
  const [checkingId, setCheckingId] = useState<string | null>(null);

  async function onDnsCheck(id: string) {
    setCheckingId(id);
    try {
      const result = await dnsCheck.mutateAsync(id);
      setChecks((prev) => ({ ...prev, [id]: result }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao consultar o DNS');
    } finally {
      setCheckingId(null);
    }
  }

  async function onVerify(id: string) {
    try {
      await verify.mutateAsync(id);
      toast.success('Domínio verificado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao verificar domínio');
    }
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!domain.trim()) return;
    try {
      await add.mutateAsync({ domain: domain.trim() });
      setDomain('');
      toast.success('Domínio adicionado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao adicionar domínio');
    }
  }

  async function onRemove(id: string, name: string) {
    if (!confirm(`Remover o domínio ${name}?`)) return;
    try {
      await remove.mutateAsync(id);
      toast.success('Domínio removido');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao remover domínio');
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Domínios próprios</h1>
        <p className="text-muted-foreground">
          Domínios que apontam para o site público desta oficina. Faça o DNS apontar para o
          servidor; o site é resolvido pelo host da requisição.
        </p>
      </div>

      <form onSubmit={onAdd} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="ex.: minhaoficina.com.br"
          className="sm:max-w-sm"
        />
        <Button type="submit" disabled={add.isPending}>
          <Plus className="size-4" /> Adicionar
        </Button>
      </form>

      {isLoading ? (
        <CarLoader />
      ) : !domains || domains.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum domínio cadastrado.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {domains.map((d) => (
            <li key={d.id} className="space-y-2 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{d.domain}</span>
                  {d.isPrimary && (
                    <Badge variant="secondary">
                      <Star className="mr-1 size-3" /> principal
                    </Badge>
                  )}
                  <Badge variant={d.verified ? 'default' : 'outline'}>
                    {d.verified ? 'verificado' : 'não verificado'}
                  </Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDnsCheck(d.id)}
                    disabled={checkingId === d.id}
                  >
                    <Stethoscope className="size-4" /> Diagnosticar
                  </Button>
                  {!d.verified && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onVerify(d.id)}
                      disabled={verify.isPending}
                    >
                      <ShieldCheck className="size-4" /> Verificar
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(d.id, d.domain)}
                    disabled={remove.isPending}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>

              {checks[d.id] && <DnsDiagnostic check={checks[d.id]} />}

              {!d.verified && (
                <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                  Para verificar, crie este registro DNS e clique em “Verificar”:
                  <div className="mt-1 grid gap-1 font-mono text-[11px] sm:grid-cols-[auto_1fr]">
                    <span className="text-foreground">Tipo:</span>
                    <span>{d.verification.type}</span>
                    <span className="text-foreground">Nome:</span>
                    <span className="break-all">{d.verification.name}</span>
                    <span className="text-foreground">Valor:</span>
                    <span className="break-all">{d.verification.value}</span>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DnsRow({
  ok,
  label,
  children,
}: {
  ok: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      {ok ? (
        <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
      ) : (
        <X className="mt-0.5 size-4 shrink-0 text-destructive" />
      )}
      <div>
        <span className="font-medium text-foreground">{label}:</span>{' '}
        <span className="font-mono text-[11px] break-all">{children}</span>
      </div>
    </div>
  );
}

function DnsDiagnostic({ check }: { check: TenantDomainDnsCheckDto }) {
  return (
    <div className="space-y-1.5 rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
      <p className="font-semibold text-foreground">Diagnóstico de DNS (consulta ao vivo)</p>
      <DnsRow ok={check.txt.ok} label={`TXT ${check.txt.name}`}>
        {check.txt.ok
          ? 'token encontrado'
          : check.txt.found.length > 0
            ? `não bate (encontrado: ${check.txt.found.join(', ')})`
            : 'registro ausente'}
      </DnsRow>
      <DnsRow ok={check.address.ok} label={`Apontamento ${check.address.name}`}>
        {check.address.records.length > 0
          ? check.address.records.join(', ')
          : 'sem registro A/AAAA/CNAME'}
      </DnsRow>
    </div>
  );
}
