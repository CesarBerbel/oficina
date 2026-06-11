/** Converte duração tipo "15m", "7d", "30s", "12h" em milissegundos. */
export function durationToMs(value: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)$/.exec(value.trim());
  if (!match) {
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
    throw new Error(`Duração inválida: ${value}`);
  }
  const amount = Number(match[1]);
  const unit = match[2];
  const factors: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return amount * factors[unit];
}
