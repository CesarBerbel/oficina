import type { ZodError, ZodIssue } from 'zod';
import { ApiError } from './api';

export type FieldLabels = Record<string, string>;

function cleanMessage(message: string): string {
  const normalized = message.trim();
  if (!normalized || normalized === 'Required') return 'preenchimento obrigatório';
  if (normalized === 'Invalid input') return 'valor inválido';
  if (normalized.includes('Expected number') || normalized.includes('received nan')) {
    return 'informe um número válido';
  }
  if (normalized.includes('Expected string')) return 'preenchimento obrigatório';
  return normalized;
}

function issuePath(issue: Pick<ZodIssue, 'path'>): string {
  return issue.path.length > 0 ? String(issue.path[0]) : 'form';
}

export function formatFieldError(fieldLabel: string, message: string): string {
  const clean = cleanMessage(message);
  const label = fieldLabel.trim();
  if (!label) return clean;
  if (clean.toLowerCase().startsWith(label.toLowerCase())) return clean;
  return `${label}: ${clean}`;
}

export function zodFieldErrors(error: ZodError, labels: FieldLabels = {}): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issuePath(issue);
    const label = labels[key] ?? key;
    if (!fieldErrors[key]) fieldErrors[key] = formatFieldError(label, issue.message);
  }
  return fieldErrors;
}

interface ValidationDetail {
  path?: string;
  message?: string;
}

function isValidationDetail(value: unknown): value is ValidationDetail {
  return typeof value === 'object' && value !== null && 'message' in value;
}

export function apiErrorMessage(error: unknown, labels: FieldLabels = {}, fallback = 'Erro ao salvar'): string {
  if (!(error instanceof ApiError)) return fallback;

  if (Array.isArray(error.details)) {
    const messages = error.details
      .filter(isValidationDetail)
      .map((detail) => {
        const key = detail.path?.split('.')[0] ?? 'form';
        const label = labels[key] ?? detail.path ?? key;
        return formatFieldError(label, detail.message ?? 'valor inválido');
      })
      .filter(Boolean);
    if (messages.length > 0) return messages.join('; ');
  }

  return error.message || fallback;
}
