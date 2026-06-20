/** Calcula a expiração padrão de links públicos de OS/orçamento. */
export function publicTokenExpiresAt(
  defaultDays = 90,
  envValue = process.env.PUBLIC_TRACKING_TOKEN_TTL_DAYS,
): Date {
  const parsed = Number(envValue ?? defaultDays);
  const safeDays = Number.isFinite(parsed) && parsed > 0 ? parsed : defaultDays;
  return new Date(Date.now() + safeDays * 24 * 60 * 60 * 1000);
}
