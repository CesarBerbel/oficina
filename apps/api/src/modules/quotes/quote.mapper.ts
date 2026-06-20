import { Prisma } from '@prisma/client';
import type { QuoteDto } from '@oficina/shared';

const dec = (v: Prisma.Decimal | number | null | undefined): number => (v == null ? 0 : Number(v));

export const quoteInclude = {
  items: { orderBy: { id: 'asc' } },
} satisfies Prisma.QuoteInclude;

export type QuoteRow = Prisma.QuoteGetPayload<{ include: typeof quoteInclude }>;

/** Mapeia um Quote (com itens) para o DTO público. `publicToken` vem da OS. */
export function toQuoteDto(quote: QuoteRow, publicToken: string): QuoteDto {
  return {
    id: quote.id,
    status: quote.status,
    token: publicToken,
    sendCount: quote.sendCount,
    publicNotes: quote.publicNotes,
    totalServices: dec(quote.totalServices),
    totalParts: dec(quote.totalParts),
    discount: dec(quote.discount),
    total: dec(quote.total),
    decisionType: quote.decisionType,
    decidedAt: quote.decidedAt ? quote.decidedAt.toISOString() : null,
    decisionIp: quote.decisionIp,
    signatureName: quote.signatureName,
    signatureDoc: quote.signatureDoc,
    createdAt: quote.createdAt.toISOString(),
    items: quote.items.map((it) => ({
      id: it.id,
      serviceOrderItemId: it.serviceOrderItemId,
      kind: it.kind,
      description: it.description,
      quantity: dec(it.quantity),
      unitPrice: dec(it.unitPrice),
      discountPercent: dec(it.discountPercent),
      discountAmount: dec(it.discountAmount),
      total: dec(it.total),
      decision: it.decision,
      parentItemId: it.parentItemId,
    })),
  };
}
