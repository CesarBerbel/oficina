import { z } from 'zod';
import { AiProvider } from '../enums/ai.js';

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
  active: z.boolean().optional(),
});
export type UpdateAiConfigInput = z.infer<typeof updateAiConfigSchema>;

export interface AiConfigDto {
  provider: AiProvider;
  hasKey: boolean;
  maskedKey: string | null;
  instructions: string | null;
  active: boolean;
}

/** Assistente de texto: gera/melhora um trecho a partir de uma instrução. */
export const aiAssistSchema = z.object({
  instruction: z.string().trim().min(3).max(500),
  content: z.string().trim().max(4000).optional(),
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
