import { z } from 'zod';
import { AiProvider } from '../enums/ai.js';

/**
 * Campos/contextos onde a IA é usada. Cada um tem uma instrução específica
 * (configurável em Configurações › IA), com um default sensato como fallback.
 * A instrução do campo entra no prompt de sistema (guia de estilo/estrutura).
 */
export const AI_FIELDS = [
  {
    key: 'os_report',
    label: 'OS — Relato na abertura',
    description: 'Como reescrever o relato do cliente ao abrir a ordem de serviço.',
    default:
      'Reescreva o relato do cliente de forma clara e organizada para registro na ordem de serviço, preservando todas as informações.',
  },
  {
    key: 'os_diagnosis',
    label: 'OS — Diagnóstico técnico',
    description: 'Como elaborar o diagnóstico técnico a partir do problema relatado.',
    default:
      'Elabore um diagnóstico técnico claro e profissional para uma oficina mecânica, com base no problema relatado.',
  },
  {
    key: 'os_notes',
    label: 'OS — Observações ao cliente',
    description: 'Como escrever as observações de andamento para o cliente.',
    default:
      'Escreva observações claras e cordiais para o cliente sobre o andamento da ordem de serviço.',
  },
  {
    key: 'message_body',
    label: 'Mensagens — Corpo',
    description: 'Estilo do corpo das mensagens (templates) enviadas ao cliente.',
    default:
      'Mensagens curtas, cordiais e diretas. Use as variáveis disponíveis (ex.: {{cliente.nome}}, {{os.numero}}, {{os.link}}) quando fizer sentido.',
  },
  {
    key: 'blog_article',
    label: 'Blog — Artigo (instruções gerais)',
    description: 'Diretrizes de estilo e estrutura para os artigos gerados pela IA.',
    default:
      'Estruture o artigo com introdução, desenvolvimento em seções e conclusão. Tom acessível e confiável, voltado a donos de veículos, com dicas práticas.',
  },
] as const;

export type AiFieldKey = (typeof AI_FIELDS)[number]['key'];

/** Instrução default de um campo (fallback quando não há configuração própria). */
export function aiFieldDefault(key: string): string {
  return AI_FIELDS.find((f) => f.key === key)?.default ?? '';
}

export const updateAiConfigSchema = z.object({
  provider: z.nativeEnum(AiProvider).optional(),
  /** Quando presente e não vazio, atualiza a chave (armazenada criptografada). */
  apiKey: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  instructions: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  /** Instruções específicas por campo (mapa campo → instrução). */
  fieldInstructions: z.record(z.string().trim().max(4000)).optional(),
  active: z.boolean().optional(),
  /** Limites de uso (null/0 = ilimitado). Contam chamadas no período. */
  dailyLimit: z.number().int().min(0).max(100_000).nullable().optional(),
  monthlyLimit: z.number().int().min(0).max(1_000_000).nullable().optional(),
  perUserDailyLimit: z.number().int().min(0).max(100_000).nullable().optional(),
});
export type UpdateAiConfigInput = z.infer<typeof updateAiConfigSchema>;

export interface AiConfigDto {
  provider: AiProvider;
  hasKey: boolean;
  maskedKey: string | null;
  instructions: string | null;
  fieldInstructions: Record<string, string>;
  active: boolean;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  perUserDailyLimit: number | null;
}

/** Assistente de texto: gera/melhora um trecho a partir de uma instrução. */
export const aiAssistSchema = z.object({
  instruction: z.string().trim().min(3).max(500),
  content: z.string().trim().max(4000).optional(),
  /** Campo/contexto (AiFieldKey) — define a instrução específica aplicada. */
  field: z.string().trim().max(40).optional(),
});
export type AiAssistInput = z.infer<typeof aiAssistSchema>;

export interface AiAssistResult {
  text: string;
}

/** Geração de artigo de blog a partir do assunto. */
export const aiArticleSchema = z.object({
  subject: z.string().trim().min(3, 'Informe o assunto').max(200),
});
export type AiArticleInput = z.infer<typeof aiArticleSchema>;

export interface AiArticleResult {
  title: string;
  excerpt: string;
  content: string;
  seoTitle: string;
  seoDescription: string;
}

/** Uma linha do log de uso da IA. */
export interface AiUsageLogDto {
  id: string;
  createdAt: string;
  userName: string | null;
  kind: string;
  field: string | null;
  provider: AiProvider;
  success: boolean;
  totalTokens: number | null;
}

/** Uso recente da IA + totais do período retornado. */
export interface AiUsageSummaryDto {
  logs: AiUsageLogDto[];
  totalCalls: number;
  totalTokens: number;
}
