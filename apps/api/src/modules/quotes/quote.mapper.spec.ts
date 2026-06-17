import { Prisma } from '@prisma/client';
import { toQuoteDto, type QuoteRow } from './quote.mapper';

const decimal = (value: number) => new Prisma.Decimal(value);

describe('toQuoteDto', () => {
  it('mapeia orçamento com totais, token público e decisões dos itens', () => {
    const createdAt = new Date('2026-06-15T10:00:00.000Z');
    const decidedAt = new Date('2026-06-15T11:00:00.000Z');
    const quote = {
      id: 'quote-1',
      tenantId: 'tenant-1',
      serviceOrderId: 'os-1',
      status: 'APROVADO_PARCIAL',
      sendCount: 2,
      publicNotes: 'Aprovação parcial registrada pelo cliente.',
      totalServices: decimal(300),
      totalParts: decimal(125.5),
      discount: decimal(25),
      total: decimal(400.5),
      decisionType: 'PARCIAL',
      decidedAt,
      decisionIp: '127.0.0.1',
      decisionUa: 'jest',
      signatureName: 'Cliente Teste',
      signatureDoc: '12345678909',
      createdAt,
      updatedAt: createdAt,
      items: [
        {
          id: 'quote-item-service',
          quoteId: 'quote-1',
          kind: 'SERVICE',
          description: 'Diagnóstico eletrônico',
          quantity: decimal(1),
          unitPrice: decimal(300),
          total: decimal(300),
          decision: 'APROVADO',
          parentItemId: null,
          serviceOrderItemId: 'os-item-service',
        },
        {
          id: 'quote-item-part',
          quoteId: 'quote-1',
          kind: 'PART',
          description: 'Filtro de óleo',
          quantity: decimal(1),
          unitPrice: decimal(125.5),
          total: decimal(125.5),
          decision: 'RECUSADO',
          parentItemId: 'quote-item-service',
          serviceOrderItemId: 'os-item-part',
        },
      ],
    } satisfies QuoteRow;

    expect(toQuoteDto(quote, 'public-token-1')).toEqual({
      id: 'quote-1',
      status: 'APROVADO_PARCIAL',
      token: 'public-token-1',
      sendCount: 2,
      publicNotes: 'Aprovação parcial registrada pelo cliente.',
      totalServices: 300,
      totalParts: 125.5,
      discount: 25,
      total: 400.5,
      decisionType: 'PARCIAL',
      decidedAt: '2026-06-15T11:00:00.000Z',
      decisionIp: '127.0.0.1',
      signatureName: 'Cliente Teste',
      signatureDoc: '12345678909',
      createdAt: '2026-06-15T10:00:00.000Z',
      items: [
        {
          id: 'quote-item-service',
          kind: 'SERVICE',
          description: 'Diagnóstico eletrônico',
          quantity: 1,
          unitPrice: 300,
          total: 300,
          decision: 'APROVADO',
          parentItemId: null,
        },
        {
          id: 'quote-item-part',
          kind: 'PART',
          description: 'Filtro de óleo',
          quantity: 1,
          unitPrice: 125.5,
          total: 125.5,
          decision: 'RECUSADO',
          parentItemId: 'quote-item-service',
        },
      ],
    });
  });

  it('retorna campos opcionais de decisão como nulos enquanto o orçamento está pendente', () => {
    const createdAt = new Date('2026-06-15T10:00:00.000Z');
    const quote = {
      id: 'quote-2',
      tenantId: 'tenant-1',
      serviceOrderId: 'os-2',
      status: 'ENVIADO',
      sendCount: 1,
      publicNotes: null,
      totalServices: decimal(100),
      totalParts: decimal(0),
      discount: decimal(0),
      total: decimal(100),
      decisionType: null,
      decidedAt: null,
      decisionIp: null,
      decisionUa: null,
      signatureName: null,
      signatureDoc: null,
      createdAt,
      updatedAt: createdAt,
      items: [],
    } satisfies QuoteRow;

    expect(toQuoteDto(quote, 'public-token-2')).toMatchObject({
      status: 'ENVIADO',
      token: 'public-token-2',
      publicNotes: null,
      decisionType: null,
      decidedAt: null,
      decisionIp: null,
      signatureName: null,
      signatureDoc: null,
      items: [],
    });
  });
});
