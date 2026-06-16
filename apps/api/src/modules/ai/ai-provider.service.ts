import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { AiProvider } from '@prisma/client';

export interface AiChatResult {
  text: string;
  totalTokens: number | null;
}

/**
 * Adapter de provedores de IA. Faz a chamada de chat e retorna o texto +
 * tokens consumidos. Usa fetch nativo (Node 20+); sem SDKs pesados.
 */
@Injectable()
export class AiProviderService {
  async chat(
    provider: AiProvider,
    apiKey: string,
    system: string,
    user: string,
  ): Promise<AiChatResult> {
    try {
      return provider === 'GEMINI'
        ? await this.gemini(apiKey, system, user)
        : await this.openai(apiKey, system, user);
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      throw new ServiceUnavailableException(
        `Falha ao chamar a IA: ${err instanceof Error ? err.message : 'erro desconhecido'}`,
      );
    }
  }

  private async openai(apiKey: string, system: string, user: string): Promise<AiChatResult> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new ServiceUnavailableException(`OpenAI ${res.status}: ${detail.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number };
    };
    return {
      text: data.choices?.[0]?.message?.content?.trim() ?? '',
      totalTokens: data.usage?.total_tokens ?? null,
    };
  }

  private async gemini(apiKey: string, system: string, user: string): Promise<AiChatResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new ServiceUnavailableException(`Gemini ${res.status}: ${detail.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { totalTokenCount?: number };
    };
    return {
      text: data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '',
      totalTokens: data.usageMetadata?.totalTokenCount ?? null,
    };
  }
}
