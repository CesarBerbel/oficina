'use client';

import { useMutation } from '@tanstack/react-query';
import type {
  AiArticleInput,
  AiArticleResult,
  AiAssistInput,
  AiAssistResult,
} from '@oficina/shared';
import { api } from '@/lib/api';

export function useAiAssist() {
  return useMutation({
    mutationFn: (input: AiAssistInput) => api.post<AiAssistResult>('/ai/assist', input),
  });
}

export function useAiArticle() {
  return useMutation({
    mutationFn: (input: AiArticleInput) => api.post<AiArticleResult>('/ai/article', input),
  });
}
