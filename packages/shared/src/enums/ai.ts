/** Provedores de IA suportados. */
export const AiProvider = {
  OPENAI: 'OPENAI',
  GEMINI: 'GEMINI',
} as const;

export type AiProvider = (typeof AiProvider)[keyof typeof AiProvider];

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  OPENAI: 'OpenAI',
  GEMINI: 'Google Gemini',
};

export const AI_PROVIDERS = Object.values(AiProvider) as AiProvider[];
