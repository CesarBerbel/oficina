import { expect, type Page } from '@playwright/test';

/**
 * Credenciais do ambiente onde o E2E roda (dev/seed). Sobrescreva por env:
 *   E2E_TENANT_SLUG, E2E_EMAIL, E2E_PASSWORD
 * Padrão = seed clássico (admin@oficina.local / Admin@123 / oficina-modelo).
 */
export const E2E_TENANT_SLUG = process.env.E2E_TENANT_SLUG ?? 'oficina-modelo';
export const E2E_EMAIL = process.env.E2E_EMAIL ?? 'admin@oficina.local';
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123';
/** Base da API (para setup via requisições diretas nos testes). */
export const E2E_API_URL = process.env.E2E_API_URL ?? 'http://localhost:3333/api';

/** Faz login pela UI com credenciais arbitrárias e aguarda o dashboard. */
export async function loginAsUI(
  page: Page,
  email: string,
  password: string,
  tenantSlug: string = E2E_TENANT_SLUG,
): Promise<void> {
  await page.goto('/login');
  await page.fill('#tenantSlug', tenantSlug);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

/** Faz login como o admin padrão do seed e aguarda o dashboard. */
export async function login(page: Page): Promise<void> {
  await loginAsUI(page, E2E_EMAIL, E2E_PASSWORD);
}
