import { z } from 'zod';

/** Paginação padrão usada em todas as listagens. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(20),
  search: z.string().trim().max(120).optional(),
  sortBy: z.string().max(60).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Paginated<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function hasRepeatedDigits(value: string): boolean {
  return /^(\d)\1+$/.test(value);
}

function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || hasRepeatedDigits(cpf)) return false;

  const calcDigit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) {
      sum += Number(cpf[i]) * (length + 1 - i);
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };

  return calcDigit(9) === Number(cpf[9]) && calcDigit(10) === Number(cpf[10]);
}

function isValidCnpj(value: string): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || hasRepeatedDigits(cnpj)) return false;

  const calcDigit = (length: 12 | 13) => {
    const weights =
      length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, weight, index) => acc + Number(cnpj[index]) * weight, 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return calcDigit(12) === Number(cnpj[12]) && calcDigit(13) === Number(cnpj[13]);
}

const phoneBaseSchema = z
  .preprocess((value) => {
    if (value === undefined || value === null) return '';
    return value;
  }, z.string())
  .transform((value) => onlyDigits(value.trim()));

/** Telefone BR opcional, aceitando fixo ou celular com DDD. Campo vazio vira null. */
export const phoneSchema = phoneBaseSchema
  .refine((value) => value.length === 0 || value.length === 10 || value.length === 11, {
    message: 'informe um telefone com DDD, com 10 ou 11 dígitos',
  })
  .transform((value) => (value.length === 0 ? null : value));

const documentBaseSchema = z
  .preprocess((value) => {
    if (value === undefined || value === null) return '';
    return value;
  }, z.string())
  .transform((value) => onlyDigits(value.trim()));

/** CPF válido, aceitando entrada com ou sem máscara. Campo vazio vira null. */
export const cpfSchema = documentBaseSchema
  .refine((value) => value.length === 0 || isValidCpf(value), {
    message: 'CPF inválido. Confira os dígitos informados.',
  })
  .transform((value) => (value.length === 0 ? null : value));

/** CNPJ válido, aceitando entrada com ou sem máscara. Campo vazio vira null. */
export const cnpjSchema = documentBaseSchema
  .refine((value) => value.length === 0 || isValidCnpj(value), {
    message: 'CNPJ inválido. Confira os dígitos informados.',
  })
  .transform((value) => (value.length === 0 ? null : value));

/** Documento BR: CPF (11) ou CNPJ (14), aceitando entrada com ou sem máscara. */
export const cpfCnpjSchema = documentBaseSchema
  .refine(
    (value) =>
      value.length === 0 ||
      (value.length === 11 && isValidCpf(value)) ||
      (value.length === 14 && isValidCnpj(value)),
    { message: 'CPF/CNPJ inválido. Confira os dígitos informados.' },
  )
  .transform((value) => (value.length === 0 ? null : value));

/** Placa Mercosul ou modelo antigo. */
export const placaSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}[-]?\d[A-Z0-9]\d{2}$/, 'Placa: formato inválido. Use ABC1D23 ou ABC-1234.');
