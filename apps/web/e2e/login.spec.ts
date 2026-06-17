import { test, expect } from '@playwright/test';
import { E2E_TENANT_SLUG, login } from './support';

test('página de login exibe o campo de oficina preenchido com o slug padrão', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByLabel('Oficina')).toBeVisible();
  await expect(page.locator('#tenantSlug')).toHaveValue(E2E_TENANT_SLUG);
});

test('login do admin leva ao dashboard', async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/\/dashboard/);
});

test('rota protegida sem sessão redireciona para login', async ({ page }) => {
  await page.goto('/os');
  await expect(page).toHaveURL(/\/login/);
});
