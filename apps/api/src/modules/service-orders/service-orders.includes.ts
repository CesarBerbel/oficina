import { Prisma } from '@prisma/client';
import { quoteInclude } from '../quotes/quote.mapper';

/**
 * Formatos de consulta (Prisma `include`) e tipos de linha derivados da OS.
 * Extraídos do service para reduzir seu tamanho e centralizar as projeções.
 */

export const summaryInclude = {
  customer: { select: { id: true, name: true, phone: true, whatsapp: true } },
  vehicle: {
    select: {
      id: true,
      plate: true,
      manufacturer: true,
      model: true,
      modelYear: true,
    },
  },
  technician: { select: { id: true, name: true } },
} satisfies Prisma.ServiceOrderInclude;

export const boardInclude = {
  ...summaryInclude,
  items: { select: { id: true } },
  quote: { select: { status: true } },
} satisfies Prisma.ServiceOrderInclude;

export const eventInclude = {
  createdBy: { select: { name: true } },
} satisfies Prisma.ServiceOrderEventInclude;

export const detailInclude = {
  ...summaryInclude,
  items: { orderBy: { createdAt: 'asc' } },
  history: {
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { name: true } } },
  },
  events: {
    orderBy: { createdAt: 'desc' },
    include: eventInclude,
  },
  quote: { include: quoteInclude },
  checkins: {
    select: { id: true },
    orderBy: { createdAt: 'desc' },
    take: 1,
  },
} satisfies Prisma.ServiceOrderInclude;

export type SummaryRow = Prisma.ServiceOrderGetPayload<{ include: typeof summaryInclude }>;
export type BoardRow = Prisma.ServiceOrderGetPayload<{ include: typeof boardInclude }>;
export type EventRow = Prisma.ServiceOrderEventGetPayload<{ include: typeof eventInclude }>;
export type DetailRow = Prisma.ServiceOrderGetPayload<{ include: typeof detailInclude }>;
