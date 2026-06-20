import { generateQuoteSchema, updateItemSchema } from '@oficina/shared';

describe('generateQuoteSchema', () => {
  it('normaliza campos vazios para undefined', () => {
    expect(generateQuoteSchema.parse({ publicNotes: '', reason: '' })).toEqual({
      publicNotes: undefined,
      reason: undefined,
    });
  });

  it('mantém observações e motivo informados', () => {
    expect(generateQuoteSchema.parse({ publicNotes: '  Olá  ', reason: '  reenvio  ' })).toEqual({
      publicNotes: 'Olá',
      reason: 'reenvio',
    });
  });
});

describe('updateItemSchema (desconto por item)', () => {
  it('coage e valida o desconto percentual entre 0 e 100', () => {
    expect(updateItemSchema.parse({ discountPercent: '12.5' })).toMatchObject({
      discountPercent: 12.5,
    });

    expect(() => updateItemSchema.parse({ discountPercent: -0.01 })).toThrow();
    expect(() => updateItemSchema.parse({ discountPercent: 100.01 })).toThrow();
  });

  it('aceita atualização sem desconto (campo opcional)', () => {
    expect(updateItemSchema.parse({ quantity: 2 })).toEqual({ quantity: 2 });
  });
});
