import { expect, type Page } from '@playwright/test';

/**
 * Credenciais do ambiente onde o E2E roda (dev/seed). Sobrescreva por env:
 *   E2E_TENANT_SLUG, E2E_EMAIL, E2E_PASSWORD
 * Padrão = seed clássico (admin@oficina.local / Admin@123 / oficina-modelo).
 */
export const E2E_TENANT_SLUG = process.env.E2E_TENANT_SLUG ?? 'oficina-modelo';
export const E2E_EMAIL = process.env.E2E_EMAIL ?? 'admin@oficina.local';
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123';

/** Faz login preenchendo os campos e aguarda o dashboard. */
export async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('#tenantSlug', E2E_TENANT_SLUG);
  await page.fill('#email', E2E_EMAIL);
  await page.fill('#password', E2E_PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}
