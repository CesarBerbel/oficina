import { durationToMs } from './duration';

describe('durationToMs', () => {
  it('converte unidades corretamente', () => {
    expect(durationToMs('30s')).toBe(30_000);
    expect(durationToMs('15m')).toBe(900_000);
    expect(durationToMs('1h')).toBe(3_600_000);
    expect(durationToMs('7d')).toBe(604_800_000);
  });

  it('aceita número puro como ms', () => {
    expect(durationToMs('500')).toBe(500);
  });

  it('lança em valor inválido', () => {
    expect(() => durationToMs('abc')).toThrow();
  });
});
