import { publicTokenExpiresAt } from './public-token';

describe('publicTokenExpiresAt', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-20T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('usa 90 dias como expiração padrão de links públicos', () => {
    expect(publicTokenExpiresAt().toISOString()).toBe('2026-09-18T12:00:00.000Z');
  });

  it('aceita override positivo por variável de ambiente', () => {
    expect(publicTokenExpiresAt(90, '7').toISOString()).toBe('2026-06-27T12:00:00.000Z');
  });

  it('ignora valores inválidos e volta para o padrão seguro', () => {
    expect(publicTokenExpiresAt(30, '0').toISOString()).toBe('2026-07-20T12:00:00.000Z');
    expect(publicTokenExpiresAt(30, '-5').toISOString()).toBe('2026-07-20T12:00:00.000Z');
    expect(publicTokenExpiresAt(30, 'abc').toISOString()).toBe('2026-07-20T12:00:00.000Z');
  });
});
