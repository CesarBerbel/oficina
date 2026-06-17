import { test, expect } from '@playwright/test';
import { login } from './support';

/**
 * Fluxo de frontend (smoke completo): login, navegação pelas seções principais
 * e cadastro de cliente pela UI. Requer API (:3333) + Web (:3000) no ar e o
 * seed aplicado (ver e2e/support.ts para credenciais / variáveis E2E_*).
 */
test.describe('Fluxo de frontend', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('navega pelas seções principais sem ser deslogado', async ({ page }) => {
    const sections: Array<{ path: string; pattern: RegExp }> = [
      { path: '/clientes', pattern: /\/clientes/ },
      { path: '/veiculos', pattern: /\/veiculos/ },
      { path: '/os', pattern: /\/os/ },
      { path: '/estoque', pattern: /\/estoque/ },
      { path: '/servicos', pattern: /\/servicos/ },
      { path: '/financeiro', pattern: /\/financeiro/ },
    ];

    for (const section of sections) {
      await page.goto(section.path);
      await expect(page).toHaveURL(section.pattern);
      // Continua autenticado (não voltou para o login) e renderizou um título.
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.getByRole('heading').first()).toBeVisible();
    }
  });

  test('cadastra um cliente pela interface', async ({ page }) => {
    const nome = `Cliente E2E ${Date.now()}`;

    await page.goto('/clientes');
    await page
      .getByRole('button', { name: /novo cliente/i })
      .first()
      .click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // 1º campo é "Tipo" (combobox); o nome é o 1º textbox do formulário.
    await dialog.getByRole('textbox').first().fill(nome);
    await dialog.getByRole('button', { name: /^criar$/i }).click();

    // O cliente recém-criado aparece na listagem.
    await expect(page.getByText(nome).first()).toBeVisible({ timeout: 15_000 });
  });
});
