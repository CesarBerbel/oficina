import { test, expect, request as pwRequest } from '@playwright/test';
import { E2E_API_URL, E2E_EMAIL, E2E_PASSWORD, E2E_TENANT_SLUG, login, loginAsUI } from './support';

/**
 * Cobertura de frontend por permissão: o menu lateral mostra/oculta itens
 * conforme o perfil. Cria um ESTOQUISTA via API e compara com o admin.
 */
const ESTOQUISTA = {
  name: 'Estoquista E2E',
  email: 'estoquista.e2e@oficina.local',
  password: 'Estoque@123',
};

test.beforeAll(async () => {
  // Cria o ESTOQUISTA (idempotente) usando o token do admin.
  const ctx = await pwRequest.newContext();
  const res = await ctx.post(`${E2E_API_URL}/auth/login`, {
    data: { tenantSlug: E2E_TENANT_SLUG, email: E2E_EMAIL, password: E2E_PASSWORD },
  });
  const { accessToken } = await res.json();
  await ctx.post(`${E2E_API_URL}/users`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      name: ESTOQUISTA.name,
      email: ESTOQUISTA.email,
      password: ESTOQUISTA.password,
      role: 'ESTOQUISTA',
      forcePasswordChange: false,
    },
  });
  // 201 (criado) ou 409 (já existe de uma execução anterior) — ambos OK.
  await ctx.dispose();
});

test('admin enxerga itens administrativos no menu', async ({ page }) => {
  await login(page);
  const nav = page.getByRole('navigation');
  await expect(nav.getByRole('link', { name: 'Métricas' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Blog' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Combos' })).toBeVisible();
});

test('estoquista não enxerga itens sem permissão, mas vê os de estoque', async ({ page }) => {
  await loginAsUI(page, ESTOQUISTA.email, ESTOQUISTA.password);
  const nav = page.getByRole('navigation');

  // Tem INVENTORY_READ / PURCHASES_READ / SERVICES_READ:
  await expect(nav.getByRole('link', { name: 'Estoque', exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Compras' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Serviços' })).toBeVisible();

  // Não tem AUDIT_READ / BLOG_WRITE / COMBOS_WRITE:
  await expect(nav.getByRole('link', { name: 'Métricas' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Blog' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Combos' })).toHaveCount(0);
});
