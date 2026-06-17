import { composeAddress, sanitizeRichHtml } from '@oficina/shared';

describe('composeAddress', () => {
  it('monta o endereço completo a partir das partes', () => {
    expect(
      composeAddress({
        addressStreet: 'Rua A',
        addressNumber: '10',
        addressComplement: 'Sala 2',
        addressDistrict: 'Centro',
        addressCity: 'São José dos Campos',
        addressState: 'SP',
        addressZip: '12000-000',
      }),
    ).toBe('Rua A, 10 - Sala 2 - Centro - São José dos Campos/SP - CEP 12000-000');
  });

  it('ignora partes vazias', () => {
    expect(composeAddress({ addressStreet: 'Rua A', addressCity: 'SJC' })).toBe('Rua A - SJC');
  });

  it('retorna null quando não há nenhuma parte', () => {
    expect(composeAddress({})).toBeNull();
    expect(composeAddress({ addressStreet: '  ', addressCity: '' })).toBeNull();
  });
});

describe('sanitizeRichHtml', () => {
  it('mantém as tags permitidas', () => {
    expect(sanitizeRichHtml('<b>oi</b> <i>x</i>')).toBe('<b>oi</b> <i>x</i>');
    expect(sanitizeRichHtml('<ul><li>a</li></ul>')).toBe('<ul><li>a</li></ul>');
  });

  it('remove atributos das tags permitidas', () => {
    expect(sanitizeRichHtml('<b style="color:red" onclick="x()">y</b>')).toBe('<b>y</b>');
  });

  it('remove script/style por completo e tags desconhecidas (preservando texto)', () => {
    expect(sanitizeRichHtml('<script>alert(1)</script><b>x</b>')).toBe('<b>x</b>');
    expect(sanitizeRichHtml('<span class="a">texto</span>')).toBe('texto');
  });

  it('trata vazio/nulo', () => {
    expect(sanitizeRichHtml('')).toBe('');
    expect(sanitizeRichHtml(null)).toBe('');
    expect(sanitizeRichHtml(undefined)).toBe('');
  });
});
