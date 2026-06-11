'use client';

import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';
import { useAiAssist } from './use-ai';
import { Button } from '@/components/ui/button';

/**
 * Botão "gerar com IA" para um campo de texto. Envia a instrução + conteúdo
 * atual e devolve o texto gerado via onResult.
 */
export function AiAssistButton({
  instruction,
  content,
  onResult,
  label = 'IA',
}: {
  instruction: string;
  content?: string;
  onResult: (text: string) => void;
  label?: string;
}) {
  const assist = useAiAssist();

  async function run() {
    try {
      const res = await assist.mutateAsync({ instruction, content: content || undefined });
      if (res.text) {
        onResult(res.text);
        toast.success('Texto gerado pela IA');
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha na IA');
    }
  }

  return (
    <Button type="button" size="sm" variant="outline" onClick={run} disabled={assist.isPending}>
      {assist.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
      {label}
    </Button>
  );
}
