import { AI_FIELDS, aiFieldDefault } from '@oficina/shared';

describe('aiFieldDefault', () => {
  it('retorna o default de cada campo conhecido', () => {
    for (const f of AI_FIELDS) {
      expect(aiFieldDefault(f.key)).toBe(f.default);
      expect(aiFieldDefault(f.key).length).toBeGreaterThan(0);
    }
  });

  it('inclui os campos esperados', () => {
    const keys = AI_FIELDS.map((f) => f.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'os_report',
        'os_diagnosis',
        'os_notes',
        'message_body',
        'blog_article',
      ]),
    );
  });

  it('retorna string vazia para campo desconhecido', () => {
    expect(aiFieldDefault('inexistente')).toBe('');
  });
});
