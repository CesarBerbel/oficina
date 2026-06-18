'use client';

import { useState } from 'react';
import { Trash2, Plus, Star, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { CarLoader } from '@/components/car-loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  useAddDomain,
  useDomains,
  useRemoveDomain,
  useVerifyDomain,
} from '@/features/domains/use-domains';

export default function DominiosPage() {
  const { data: domains, isLoading } = useDomains();
  const add = useAddDomain();
  const remove = useRemoveDomain();
  const verify = useVerifyDomain();
  const [domain, setDomain] = useState('');

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
