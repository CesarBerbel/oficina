import { generateQuoteSchema } from '@oficina/shared';

describe('generateQuoteSchema', () => {
  it('normaliza campos vazios e define itemDiscounts como array vazio', () => {
    expect(generateQuoteSchema.parse({ publicNotes: '', reason: '' })).toEqual({
      publicNotes: undefined,
      reason: undefined,
      itemDiscounts: [],
    });
  });

  it('coage e valida desconto percentual por item entre 0 e 100', () => {
    expect(
      generateQuoteSchema.parse({
        itemDiscounts: [{ serviceOrderItemId: 'os-item-1', discountPercent: '12.5' }],
      }),
    ).toMatchObject({
      itemDiscounts: [{ serviceOrderItemId: 'os-item-1', discountPercent: 12.5 }],
    });

    expect(() =>
      generateQuoteSchema.parse({
        itemDiscounts: [{ serviceOrderItemId: 'os-item-1', discountPercent: -0.01 }],
      }),
    ).toThrow();
    expect(() =>
      generateQuoteSchema.parse({
        itemDiscounts: [{ serviceOrderItemId: 'os-item-1', discountPercent: 100.01 }],
      }),
    ).toThrow();
  });

  it('rejeita desconto sem item de OS associado', () => {
    expect(() =>
      generateQuoteSchema.parse({
        itemDiscounts: [{ serviceOrderItemId: '', discountPercent: 10 }],
      }),
    ).toThrow();
  });
});
