import { defineConfig, devices } from '@playwright/test';

/**
 * E2E do frontend. Requer API (:3333) e Web (:3000) rodando e o seed aplicado.
 * Rodar: pnpm --filter @oficina/web exec playwright install --with-deps && pnpm --filter @oficina/web test:e2e
 */
export default defineConfig({
  testDir: './e2e',
  // screenshots.spec é utilitário de docs (sem asserções) — fora do gate de testes.
  testIgnore: '**/screenshots.spec.ts',
  // Serial: evita contenção de cold-compile do `next dev` entre testes paralelos.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
