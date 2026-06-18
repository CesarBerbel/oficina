import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { AiProvider } from '@prisma/client';

export interface AiChatResult {
  text: string;
  totalTokens: number | null;
}

/** Tempo máximo de uma chamada à IA (evita request pendurado). */
const AI_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 30_000);

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

  /** fetch com timeout via AbortController (aborta a requisição pendurada). */
  private async timedFetch(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ServiceUnavailableException(
          `A IA não respondeu em ${Math.round(AI_TIMEOUT_MS / 1000)}s.`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private async openai(apiKey: string, system: string, user: string): Promise<AiChatResult> {
    const res = await this.timedFetch('https://api.openai.com/v1/chat/completions', {
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
    const res = await this.timedFetch(url, {
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
