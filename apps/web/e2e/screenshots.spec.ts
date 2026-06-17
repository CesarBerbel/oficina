import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { login } from './support';

/**
 * Captura screenshots de todas as telas do sistema para o tutorial.
 * Requer API (:3333) e Web (:3000) rodando com o seed aplicado.
 * Saída: docs/imgs/*.png
 *
 * Rodar: pnpm --filter @oficina/web exec playwright test screenshots
 */

const OUT = path.resolve(__dirname, '../../../docs/imgs');

test.use({ viewport: { width: 1440, height: 900 } });

async function shot(page: Page, name: string, full = true) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });
}

async function go(page: Page, route: string, name: string, full = true) {
  await page.goto(route);
  await shot(page, name, full);
}

// Telas internas (exigem login), em ordem do menu lateral + hub de configurações.
const DASHBOARD_ROUTES: Array<[string, string]> = [
  ['/dashboard', '01-dashboard'],
  ['/operacional', '02-operacional'],
  ['/central-notificacoes', '03-inbox'],
  ['/central-acoes', '04-central-acoes'],
  ['/clientes', '05-clientes'],
  ['/veiculos', '06-veiculos'],
  ['/check-in', '07-check-in'],
  ['/check-in/novo', '08-check-in-novo'],
  ['/os', '09-os-lista'],
  ['/kanban', '10-kanban'],
  ['/servicos', '11-servicos'],
  ['/combos', '12-combos'],
  ['/estoque', '13-estoque'],
  ['/nfe-import', '14-nfe-import'],
  ['/compras', '15-compras'],
  ['/leads', '16-recepcao'],
  ['/crm', '17-crm'],
  ['/blog', '18-blog'],
  ['/relatorios', '19-relatorios'],
  ['/configuracoes', '20-configuracoes'],
  ['/site-config', '21-site-config'],
  ['/categorias', '22-categorias'],
  ['/mensagens', '23-mensagens'],
  ['/configuracoes/crm', '24-config-crm'],
  ['/configuracoes/operacional', '25-config-operacional'],
  ['/usuarios', '26-usuarios'],
  ['/ia', '27-ia'],
  ['/auditoria', '28-auditoria'],
  ['/notificacoes', '29-notificacoes'],
];

// Site público (sem login).
const PUBLIC_ROUTES: Array<[string, string]> = [
  ['/site', '40-site-home'],
  ['/site/sobre', '41-site-sobre'],
  ['/site/servicos', '42-site-servicos'],
  ['/site/garagem', '43-site-garagem'],
  ['/site/blog', '44-site-blog'],
  ['/site/contato', '45-site-contato'],
  ['/site/consulta', '46-site-consulta'],
  ['/acompanhar', '47-acompanhar'],
];

test('captura telas internas (logado)', async ({ page }) => {
  test.setTimeout(300_000);

  // Login
  await page.goto('/login');
  await shot(page, '00-login');
  await login(page);

  for (const [route, name] of DASHBOARD_ROUTES) {
    await go(page, route, name);
  }

  // Detalhe de cliente: abre o primeiro da lista.
  await page.goto('/clientes');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);
  const clienteLink = page.locator('a[href^="/clientes/"]').first();
  if (await clienteLink.count()) {
    await clienteLink.click();
    await expect(page).toHaveURL(/\/clientes\/.+/);
    await shot(page, '05b-cliente-detalhe');
  }

  // Detalhe de OS: abre a primeira da lista.
  await page.goto('/os');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);
  const osLink = page.locator('a[href^="/os/"]').first();
  if (await osLink.count()) {
    await osLink.click();
    await expect(page).toHaveURL(/\/os\/.+/);
    await shot(page, '09b-os-detalhe');
  }
});

test('captura site público', async ({ page }) => {
  test.setTimeout(180_000);
  for (const [route, name] of PUBLIC_ROUTES) {
    await go(page, route, name);
  }
});
