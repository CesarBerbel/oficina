'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { AI_PROVIDERS, AI_PROVIDER_LABELS, updateAiConfigSchema } from '@oficina/shared';
import { apiErrorMessage, zodFieldErrors } from '@/lib/form-errors';
import { useAiConfig, useUpdateAiConfig } from '@/features/settings/use-settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

const FIELD_LABELS = {
  provider: 'Provedor',
  apiKey: 'Chave de API',
  instructions: 'Instruções',
  active: 'Ativo',
};

export default function AiConfigPage() {
  const { data, isLoading } = useAiConfig();
  const update = useUpdateAiConfig();
  const [provider, setProvider] = useState('OPENAI');
  const [apiKey, setApiKey] = useState('');
  const [instructions, setInstructions] = useState('');
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (data) {
      setProvider(data.provider);
      setInstructions(data.instructions ?? '');
      setActive(data.active);
    }
  }, [data]);

  async function save() {
    const payload = { provider, instructions, active, ...(apiKey ? { apiKey } : {}) };
    const parsed = updateAiConfigSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(Object.values(zodFieldErrors(parsed.error, FIELD_LABELS))[0] ?? 'Verifique os campos do formulário');
      return;
    }
    try {
      await update.mutateAsync(parsed.data);
      setApiKey('');
      toast.success('Configuração de IA salva');
    } catch (err) {
      toast.error(apiErrorMessage(err, FIELD_LABELS));
    }
  }

  if (isLoading) {
    return <div className="grid h-64 place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Sparkles className="size-6 text-primary" /> Assistente de IA
        </h1>
        <p className="text-muted-foreground">Configure o provedor e a chave de API (armazenada criptografada).</p>
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-5">
        <div className="space-y-1.5">
          <Label required>Provedor</Label>
          <Select value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full">
            {AI_PROVIDERS.map((p) => <option key={p} value={p}>{AI_PROVIDER_LABELS[p]}</option>)}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>
            Chave de API{' '}
            {data?.hasKey && <Badge variant="success" className="ml-1">configurada: {data.maskedKey}</Badge>}
          </Label>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={data?.hasKey ? 'Deixe em branco para manter a chave atual' : 'Cole a chave de API'}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">A chave é criptografada (AES-256-GCM) e nunca exibida em texto puro.</p>
        </div>

        <div className="space-y-1.5">
          <Label>Instruções (prompt do sistema)</Label>
          <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={5}
            placeholder="Ex.: Responda em português, tom profissional e objetivo..." />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Assistente ativo
        </label>
      </div>

      <Button onClick={save} disabled={update.isPending}>
        {update.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        Salvar
      </Button>
    </div>
  );
}
