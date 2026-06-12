'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Car, KeyRound, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import {
  requestGarageCode,
  verifyGarageCode,
  setGarageToken,
} from '@/features/garage/garage-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ConsultaPage() {
  const router = useRouter();
  const [step, setStep] = useState<'plate' | 'code'>('plate');
  const [plate, setPlate] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  // Link do e-mail (…/site/consulta?placa=XXX): pré-preenche a placa e vai
  // direto para a etapa de digitar o código, já que ele acabou de ser enviado.
  useEffect(() => {
    const value = new URLSearchParams(window.location.search)
      .get('placa')
      ?.toUpperCase();
    if (value) {
      setPlate(value);
      setStep('code');
    }
  }, []);

  async function onRequest(e: React.FormEvent) {
    e.preventDefault();
    const value = plate.trim().toUpperCase();
    if (value.length < 7) {
      toast.error('Informe a placa do veículo.');
      return;
    }
    setLoading(true);
    try {
      await requestGarageCode(value);
      setStep('code');
      toast.success('Se a placa estiver cadastrada, enviamos um código por e-mail.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar o código.');
    } finally {
      setLoading(false);
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      toast.error('Informe o código de 6 dígitos.');
      return;
    }
    setLoading(true);
    try {
      const session = await verifyGarageCode(plate.trim().toUpperCase(), code);
      setGarageToken(session.token);
      toast.success('Acesso liberado!');
      router.push('/site/garagem');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Código inválido.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container max-w-md py-12">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Consultar meu veículo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Acompanhe a ordem de serviço atual e o histórico do seu carro.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            {step === 'plate' ? (
              <>
                <Car className="size-4" /> Informe a placa
              </>
            ) : (
              <>
                <KeyRound className="size-4" /> Digite o código
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {step === 'plate' ? (
            <form onSubmit={onRequest} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="plate">Placa do veículo</Label>
                <Input
                  id="plate"
                  value={plate}
                  onChange={(e) => setPlate(e.target.value.toUpperCase())}
                  placeholder="ABC1D23"
                  autoCapitalize="characters"
                  maxLength={8}
                  className="uppercase tracking-widest"
                />
                <p className="text-xs text-muted-foreground">
                  Enviaremos um código de acesso para o e-mail do proprietário
                  cadastrado.
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                Enviar código
              </Button>
            </form>
          ) : (
            <form onSubmit={onVerify} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="code">Código de 6 dígitos</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  placeholder="000000"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="text-center text-lg tracking-[0.5em]"
                />
                <p className="text-xs text-muted-foreground">
                  Verifique a caixa de entrada (e o spam) do e-mail cadastrado. O
                  código vale por 5 horas.
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                Acessar histórico
              </Button>
              <button
                type="button"
                onClick={() => {
                  setStep('plate');
                  setCode('');
                }}
                className="flex w-full items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-3" /> Usar outra placa
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
