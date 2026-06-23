import { Prisma } from '@prisma/client';

/**
 * Serialização do dump lógico. Linhas do banco voltam de `SELECT *` com tipos
 * JS ricos (Date, Buffer/bytea, Prisma.Decimal, bigint) que o JSON puro perde.
 * Cada valor "especial" vira um envelope `{ [MARKER]: tipo, v: <repr> }` para
 * ser reconstruído fielmente na restauração.
 *
 * O marcador é improvável de colidir com chaves reais de colunas jsonb.
 */
export const MARKER = '__oficinaBk';

type Envelope = { [MARKER]: 'bigint' | 'date' | 'bytes' | 'decimal'; v: string };

function isEnvelope(value: unknown): value is Envelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.prototype.hasOwnProperty.call(value, MARKER)
  );
}

/** Converte um valor vindo do banco numa forma JSON-safe e reversível. */
export function encodeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'bigint') return { [MARKER]: 'bigint', v: value.toString() };
  if (value instanceof Date) return { [MARKER]: 'date', v: value.toISOString() };
  if (Buffer.isBuffer(value)) return { [MARKER]: 'bytes', v: value.toString('base64') };
  if (value instanceof Uint8Array) {
    return { [MARKER]: 'bytes', v: Buffer.from(value).toString('base64') };
  }
  if (Prisma.Decimal.isDecimal(value)) {
    return { [MARKER]: 'decimal', v: (value as Prisma.Decimal).toString() };
  }
  if (Array.isArray(value)) return value.map((v) => encodeValue(v));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = encodeValue(v);
    return out;
  }
  return value;
}

/** Reconstrói um valor a partir da forma serializada pelo {@link encodeValue}. */
export function decodeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (isEnvelope(value)) {
    const env = value;
    switch (env[MARKER]) {
      case 'bigint':
        return BigInt(env.v);
      case 'date':
        return new Date(env.v);
      case 'bytes':
        return Buffer.from(env.v, 'base64');
      case 'decimal':
        return new Prisma.Decimal(env.v);
    }
  }
  if (Array.isArray(value)) return value.map((v) => decodeValue(v));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = decodeValue(v);
    return out;
  }
  return value;
}

/** Uma linha do arquivo NDJSON: dados de uma tabela ou o cabeçalho `_meta`. */
export interface BackupMeta {
  format: 'oficina-logical-backup';
  version: 1;
  createdAt: string;
  appVersion: string;
  /** Tabelas na ordem de restauração (pais antes dos filhos). */
  tables: string[];
  /** Linhas por tabela (conferência). */
  counts: Record<string, number>;
}
