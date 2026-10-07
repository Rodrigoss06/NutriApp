import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env['E2E_PORT'] ?? 3000);

/**
 * Pruebas de interfaz (06 §6): escritorio y móvil, con axe. Corren contra el build de producción
 * (`pnpm build` antes) con APP_ENV=local para ver el catálogo.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['list']] : 'list',
  use: { baseURL: `http://127.0.0.1:${String(PORT)}`, locale: 'es-PE', trace: 'retain-on-failure' },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
    { name: 'movil', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `next start --port ${String(PORT)}`,
    url: `http://127.0.0.1:${String(PORT)}/mi/hoy`,
    reuseExistingServer: !process.env['CI'],
    env: { APP_ENV: 'local' },
    timeout: 60_000,
  },
});
