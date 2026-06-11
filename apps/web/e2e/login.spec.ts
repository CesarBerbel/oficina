import { test, expect } from '@playwright/test';

test('pagina de login exibe campo de oficina e dados da seed', async ({ page }) => {
  await page.goto('/login');

  await expect(page.getByLabel('Oficina')).toBeVisible();
  await expect(page.locator('#tenantSlug')).toHaveValue('oficina-modelo');
  await expect(page.getByText('Dados de acesso da seed')).toBeVisible();
  await expect(page.getByText('admin@oficina.local')).toBeVisible();
  await expect(page.getByText('Admin@123')).toBeVisible();
});

test('login do admin leva ao dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Preencher dados de demonstração' }).click();
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText(/Olá,/)).toBeVisible();
});

test('rota protegida sem sessão redireciona para login', async ({ page }) => {
  await page.goto('/os');
  await expect(page).toHaveURL(/\/login/);
});
