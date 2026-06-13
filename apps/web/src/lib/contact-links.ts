import { onlyDigits } from './masks';

/** Retorna um link tel: seguro quando o valor possui dígitos. */
export function buildTelHref(value: string | null | undefined): string | null {
  const digits = onlyDigits(value);
  return digits ? `tel:${digits}` : null;
}

/**
 * Normaliza telefone para o formato internacional esperado pelo wa.me.
 * Como o sistema usa máscara brasileira, números com DDD e sem país recebem o prefixo 55.
 */
export function normalizeWhatsAppDigits(value: string | null | undefined): string {
  const digits = onlyDigits(value).replace(/^0+/, '');
  if (!digits) return '';
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

/** Retorna a URL para abrir conversa no WhatsApp, ou null quando não há número. */
export function buildWhatsAppHref(
  value: string | null | undefined,
  message?: string,
): string | null {
  const number = normalizeWhatsAppDigits(value);
  if (!number) return null;
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${number}${text}`;
}

/** Compara dois telefones ignorando máscara/formatação. */
export function samePhoneDigits(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const leftDigits = onlyDigits(left);
  const rightDigits = onlyDigits(right);
  return Boolean(leftDigits && rightDigits && leftDigits === rightDigits);
}
